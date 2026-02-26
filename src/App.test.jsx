import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import App from './App.jsx'
import api from './lib/api'

function setRoute(path) {
  window.history.pushState({}, '', path)
}

describe('App frontend flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setRoute('/login')
  })

  it('executes login flow with session/cookie auth endpoints', async () => {
    let isLogged = false

    api.get.mockImplementation((url) => {
      if (url === '/auth/me/') {
        return Promise.resolve(
          isLogged
            ? { data: { authenticated: true, user: { id: 10, username: 'alice' } } }
            : { data: { authenticated: false } },
        )
      }
      if (url === '/api/meta/connection-status') {
        return Promise.resolve({
          data: {
            connected: false,
            has_valid_long_token: false,
            sync_requires_reconnect: true,
            id_meta_user: null,
            expired_at: null,
          },
        })
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })

    api.post.mockImplementation((url) => {
      if (url === '/auth/login/') {
        isLogged = true
        return Promise.resolve({ data: { authenticated: true } })
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`))
    })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Secret123!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Conexão / Sincronização' })).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/auth/login/', {
      username: 'alice',
      password: 'Secret123!',
    })
  })

  it('shows sync logs in connection/sync page', async () => {
    setRoute('/app/conexao')

    api.get.mockImplementation((url) => {
      if (url === '/auth/me/') {
        return Promise.resolve({ data: { authenticated: true, user: { id: 20, username: 'sync-user' } } })
      }
      if (url === '/api/meta/connection-status') {
        return Promise.resolve({
          data: {
            connected: true,
            has_valid_long_token: true,
            sync_requires_reconnect: false,
            id_meta_user: 'meta-user-20',
            expired_at: null,
          },
        })
      }
      if (url.startsWith('/api/meta/sync/77/logs')) {
        return Promise.resolve({
          data: {
            sync_run: {
              id: 77,
              status: 'success',
              started_at: '2026-02-22T10:00:00Z',
              finished_at: '2026-02-22T10:01:00Z',
              is_finished: true,
            },
            logs: [
              {
                id: 1,
                entidade: 'ad_accounts',
                mensagem: 'Extraindo e salvando contas.',
                timestamp: '2026-02-22T10:00:05Z',
              },
            ],
            next_since_id: 1,
          },
        })
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })

    api.post.mockImplementation((url) => {
      if (url === '/api/meta/sync/start/meta') {
        return Promise.resolve({
          data: {
            sync_run_id: 77,
            status: 'pending',
          },
        })
      }
      if (url === '/api/meta/sync/start/insights-7d') {
        return Promise.resolve({
          data: {
            sync_run_id: 77,
            status: 'pending',
          },
        })
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`))
    })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Conexão / Sincronização' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sincronizar (7 dias)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sincronizar Meta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sincronizar Instagram' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar (7 dias)' }))

    expect(await screen.findByText('Sincronizacao de insights (7 dias) iniciada.')).toBeInTheDocument()
    expect(await screen.findByText('Sincronizacao concluida com sucesso.')).toBeInTheDocument()
    expect(await screen.findByText(/\[ad_accounts\]/i)).toBeInTheDocument()
  })

  it('renders meta dashboard filters, chart and KPIs', async () => {
    setRoute('/app/dashboard-meta')

    api.get.mockImplementation((url) => {
      if (url === '/auth/me/') {
        return Promise.resolve({ data: { authenticated: true, user: { id: 30, username: 'meta-user' } } })
      }
      if (url === '/api/meta/filters') {
        return Promise.resolve({
          data: {
            ad_accounts: [{ id_meta_ad_account: 'act_1', name: 'Conta Principal' }],
            campaigns: [{ id_meta_campaign: 'cmp_1', name: 'Campanha A' }],
            adsets: [{ id_meta_adset: 'ads_1', name: 'AdSet A' }],
            ads: [{ id_meta_ad: 'ad_1', name: 'Ad A' }],
          },
        })
      }
      if (url === '/api/meta/timeseries') {
        return Promise.resolve({
          data: {
            series: [
              { date: '2026-01-01', impressions: 100, reach: 50, spend: 10, results: 8, clicks: 20 },
              { date: '2026-01-02', impressions: 200, reach: 120, spend: 20, results: 11, clicks: 30 },
            ],
          },
        })
      }
      if (url === '/api/meta/kpis') {
        return Promise.resolve({
          data: {
            kpis: {
              gasto_total: 30,
              impressao_total: 300,
              alcance_total: 170,
              ctr_medio: 16.6667,
              cpm_medio: 100,
              cpc_medio: 0.6,
              frequencia_media: 1.7647,
            },
          },
        })
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })

    api.post.mockRejectedValue(new Error('No POST expected'))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Dashboard Meta' })).toBeInTheDocument()
    expect(screen.getByLabelText('Filtro de ad account')).toBeInTheDocument()
    expect(screen.getByText('Nova anotacao')).toBeInTheDocument()
    expect(screen.getByText('Anotacoes da conta')).toBeInTheDocument()
    expect(screen.getByText('Serie temporal de insights')).toBeInTheDocument()
    expect(screen.queryByText('Sem dados para os filtros selecionados.')).not.toBeInTheDocument()
    expect(screen.getByText('Gasto Total')).toBeInTheDocument()
    expect(screen.getByText('Impressão Total')).toBeInTheDocument()
  })

  it('renders instagram KPIs and media table with sorting action', async () => {
    setRoute('/app/dashboard-instagram')

    api.get.mockImplementation((url, config) => {
      if (url === '/auth/me/') {
        return Promise.resolve({ data: { authenticated: true, user: { id: 40, username: 'ig-user' } } })
      }
      if (url === '/api/instagram/accounts') {
        return Promise.resolve({
          data: {
            accounts: [{ id_meta_instagram: 'ig_1', name: 'Conta IG 1', id_meta_page: 'page_1' }],
          },
        })
      }
      if (url === '/api/instagram/kpis') {
        return Promise.resolve({
          data: {
            kpis: {
              alcance: 1000,
              impressoes: 4000,
              curtidas: 120,
              comentarios: 20,
              salvos: 9,
              compartilhamentos: 5,
            },
          },
        })
      }
      if (url === '/api/instagram/media-table') {
        const ordering = config?.params?.ordering || '-date'
        return Promise.resolve({
          data: {
            ordering,
            total: 1,
            rows: [
              {
                id_meta_media: 'm_1',
                id_meta_instagram: 'ig_1',
                date: '2026-02-20T12:00:00Z',
                tipo: 'REEL',
                caption: 'Post de teste',
                reach: 500,
                views: 900,
                likes: 50,
                comments: 7,
                saved: 4,
                shares: 3,
                plays: 1000,
                link: 'https://instagram.com/p/teste',
              },
            ],
          },
        })
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })

    api.post.mockRejectedValue(new Error('No POST expected'))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Dashboard Instagram' })).toBeInTheDocument()

    expect(await screen.findByText(/Alcance: 1.000/)).toBeInTheDocument()
    expect(screen.getByText('Post de teste')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Reach/ }))

    await waitFor(() => {
      const mediaCalls = api.get.mock.calls.filter(([url]) => url === '/api/instagram/media-table')
      const lastCall = mediaCalls[mediaCalls.length - 1]
      expect(lastCall[1].params.ordering).toBe('-reach')
    })
  })
})
