import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
  setCsrfToken: vi.fn(),
}))

import App from './App.jsx'
import api from './lib/api'
import { daysAgo, toInputDate } from './pages/pageUtils'

function setRoute(path) {
  window.history.pushState({}, '', path)
}

describe('App frontend flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setRoute('/login')
  })

  it('renders clientes estado kanban grouped by status', async () => {
    setRoute('/app/clientes/estado')

    api.get.mockImplementation((url) => {
      if (url === '/auth/me/') {
        return Promise.resolve({ data: { authenticated: true, user: { id: 40, username: 'estado-user' } } })
      }
      if (url === '/api/empresa/clientes') {
        return Promise.resolve({
          data: {
            clientes: [
              {
                id: 1,
                name: 'Cliente Critico',
                nome: 'Conta A',
                id_meta_ad_account: 'act_1',
                nicho_atuacao: 'Servico',
                data_renovacao_creditos: '2026-02-10',
                estado: 'MAU',
                descricao_estado: 'Precisa de atencao',
              },
              {
                id: 2,
                name: 'Cliente Estavel',
                nome: 'Conta B',
                id_meta_ad_account: 'act_2',
                nicho_atuacao: 'Ecommerce',
                data_renovacao_creditos: '2026-02-12',
                estado: 'REGULAR',
                descricao_estado: '',
              },
              {
                id: 3,
                name: 'Cliente Saudavel',
                nome: 'Conta C',
                id_meta_ad_account: 'act_3',
                nicho_atuacao: 'Educacao',
                data_renovacao_creditos: '2026-02-15',
                estado: 'BOM',
                descricao_estado: 'Fluxo em dia',
              },
            ],
          },
        })
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Clientes / Estado' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mau' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Regular' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Bom' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Cliente Critico')).toBeInTheDocument()
      expect(screen.getByText('Cliente Estavel')).toBeInTheDocument()
      expect(screen.getByText('Cliente Saudavel')).toBeInTheDocument()
    })
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

    fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'alice' } })
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
    expect(screen.getByRole('button', { name: 'Ultimos 7 dias' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apenas Meta Ads' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apenas Instagram' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Data inicial da sincronizacao'), { target: { value: '2026-02-01' } })
    fireEvent.change(screen.getByLabelText('Data final da sincronizacao'), { target: { value: '2026-02-10' } })

    fireEvent.click(screen.getByRole('button', { name: 'Apenas Meta Ads' }))

    expect(api.post).toHaveBeenCalledWith('/api/meta/sync/start/meta', {
      date_start: '2026-02-01',
      date_end: '2026-02-10',
    })
    expect(await screen.findByText('Sincronizacao Meta iniciada.')).toBeInTheDocument()
    expect(await screen.findByText('Sincronizacao concluida com sucesso.')).toBeInTheDocument()
    expect(await screen.findByText('Ad Account')).toBeInTheDocument()
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
            campaigns: [
              {
                id_meta_campaign: 'cmp_1',
                name: 'Campanha A',
                status_display: 'ATIVO',
                display_name: 'Campanha A - ATIVO',
              },
            ],
            adsets: [
              {
                id_meta_adset: 'ads_1',
                name: 'AdSet A',
                status_display: 'DESATIVADO',
                display_name: 'AdSet A - DESATIVADO',
              },
            ],
            ads: [
              {
                id_meta_ad: 'ad_1',
                name: 'Ad A',
                status_display: 'ATIVO',
                display_name: 'Ad A - ATIVO',
              },
            ],
          },
        })
      }
      if (url === '/api/meta/timeseries') {
        return Promise.resolve({
          data: {
            series: [
              { date: '2026-02-01', impressions: 100, reach: 50, spend: 10, results: 8, clicks: 20 },
              { date: '2026-02-02', impressions: 200, reach: 120, spend: 20, results: 11, clicks: 30 },
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
      if (url === '/api/meta/specific-insights') {
        return Promise.resolve({
          data: {
            timeseries_daily: [
              { date: '2026-01-01', spend: 15, results: 9 },
              { date: '2026-01-02', spend: 22, results: 11 },
            ],
            timeseries_by_ad: [
              {
                ad_id: 'ad_1',
                ad_name: 'Ad A',
                points: [
                  { date: '2026-01-01', spend: 6, results: 4 },
                  { date: '2026-01-02', spend: 10, results: 5 },
                ],
              },
              {
                ad_id: 'ad_2',
                ad_name: 'Ad B',
                points: [
                  { date: '2026-01-01', spend: 9, results: 5 },
                  { date: '2026-01-02', spend: 12, results: 6 },
                ],
              },
            ],
            rows_by_ad: [
              { ad_id: 'ad_1', ad_name: 'Ad A', results: 8, spend: 10, cpr: 1.25 },
              { ad_id: 'ad_2', ad_name: 'Ad B', results: 0, spend: 12, cpr: null },
            ],
          },
        })
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })

    api.post.mockRejectedValue(new Error('No POST expected'))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Dashboard Meta' })).toBeInTheDocument()
    expect(screen.getByLabelText('Filtro de ad account')).toBeInTheDocument()
    expect(screen.getByText('Nova anotação')).toBeInTheDocument()
    expect(screen.getByText('Anotações da conta')).toBeInTheDocument()
    expect(screen.getByText('Serie temporal de insights')).toBeInTheDocument()
    expect(screen.getByText('Gasto Total')).toBeInTheDocument()
    expect(screen.getByText('Impressão Total')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Específica' })).toHaveAttribute('aria-selected', 'false')
    fireEvent.click(screen.getByLabelText('Filtro de campaign'))
    expect(await screen.findByRole('button', { name: 'Campanha A - ATIVO' })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Filtro de adset'))
    expect(await screen.findByRole('button', { name: 'AdSet A - DESATIVADO' })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Filtro de ads'))
    expect(await screen.findByRole('button', { name: 'Ad A - ATIVO' })).toBeInTheDocument()
  })

  it('renders relatorios page with sidebar entry and requested metrics', async () => {
    setRoute('/app/relatorios')
    const expectedDateStart = toInputDate(daysAgo(7))
    const expectedDateEnd = toInputDate(daysAgo(1))
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })

    api.get.mockImplementation((url) => {
      if (url === '/auth/me/') {
        return Promise.resolve({ data: { authenticated: true, user: { id: 32, username: 'report-user' } } })
      }
      if (url === '/api/meta/filters') {
        return Promise.resolve({
          data: {
            ad_accounts: [{ id_meta_ad_account: 'act_1', name: 'Conta Principal' }],
            campaigns: [
              {
                id_meta_campaign: 'cmp_1',
                name: 'Campanha A',
                status_display: 'ATIVO',
                display_name: 'Campanha A - ATIVO',
              },
            ],
          },
        })
      }
      if (url === '/api/meta/report-summary') {
        return Promise.resolve({
          data: {
            metrics: {
              orcamento: 120,
              valor_usado: 30,
              resultados: 8,
              custo_por_resultado: 3.75,
              cpc_link: 1,
              ctr_link: 10,
              taxa_video_3s_por_impressoes: 20,
              tx_conversao_envio_mensagem: 26.6667,
              cpm: 100,
              alcance: 150,
              frequencia: 2,
              impressoes: 300,
              cliques_link: 30,
            },
            metric_changes: {
              valor_usado: 5.6,
              resultados: 14.25,
              custo_por_resultado: -3.1,
              cpc_link: 0,
              ctr_link: 2.3456,
              taxa_video_3s_por_impressoes: 9.1,
              tx_conversao_envio_mensagem: -4.2,
              cpm: 8.4,
              alcance: 1.5,
              frequencia: null,
              impressoes: 12.8,
              cliques_link: -6.4,
            },
          },
        })
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Relatorios' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Relatorios/i })).toBeInTheDocument()
    expect(screen.getByText('Valor usado')).toBeInTheDocument()
    expect(screen.getByText('Cliques no link')).toBeInTheDocument()
    expect(screen.getByLabelText('Data inicial do relatorio')).toHaveValue(expectedDateStart)
    expect(screen.getByLabelText('Data final do relatorio')).toHaveValue(expectedDateEnd)
    fireEvent.click(screen.getByLabelText('Filtro de campaign'))
    expect(await screen.findByRole('button', { name: 'Campanha A - ATIVO' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText((_, element) => element?.textContent === '26,67%')).toBeInTheDocument()
    })
    const positiveSpend = screen.getByText('+5,60%')
    const negativeClicks = screen.getByText('-6,40%')
    const positiveCpm = screen.getByText('+8,40%')
    const negativeCpr = screen.getByText('-3,10%')
    expect(positiveSpend).toHaveClass('reports-metric-delta', 'reports-metric-delta-positive')
    expect(negativeClicks).toHaveClass('reports-metric-delta', 'reports-metric-delta-negative')
    expect(positiveCpm).toHaveClass('reports-metric-delta', 'reports-metric-delta-negative')
    expect(negativeCpr).toHaveClass('reports-metric-delta', 'reports-metric-delta-positive')
    expect(screen.getByText('sem base anterior')).toHaveClass('reports-metric-delta', 'reports-metric-delta-neutral')
    expect(screen.getByRole('button', { name: 'Copiar mensagem para WhatsApp' })).toBeInTheDocument()
    await waitFor(() => {
      const reportValue = screen.getByLabelText('Mensagem de relatório para WhatsApp').value.replace(/\u00a0/g, ' ')
      expect(reportValue).toBe(`*Relatório Meta Ads Conta Principal:*

Olá, bom dia! Segue o relatório da semana passada no Meta Ads para nossas campanhas de mensagens:
* Valor usado: R$ 30,00 (+5,60%)
* Mensagens: 8 (+14,25%)
* Custo por mensagens: R$ 3,75 (-3,10%)
* CTR: 10,00% (+2,35%)
* CPM: R$ 100,00 (+8,40%)
* Tx de mensagem: 26,67% (-4,20%)

Obs.: 
`)
    })
  })

  it('allows selecting multiple accounts in relatorios filters', async () => {
    setRoute('/app/relatorios')

    api.get.mockImplementation((url) => {
      if (url === '/auth/me/') {
        return Promise.resolve({ data: { authenticated: true, user: { id: 33, username: 'report-multi-user' } } })
      }
      if (url === '/api/meta/filters') {
        return Promise.resolve({
          data: {
            ad_accounts: [
              { id_meta_ad_account: 'act_1', name: 'Conta Principal' },
              { id_meta_ad_account: 'act_2', name: 'Conta Secundaria' },
            ],
            campaigns: [
              {
                id_meta_campaign: 'cmp_1',
                name: 'Campanha A',
                status_display: 'ATIVO',
                display_name: 'Campanha A - ATIVO',
              },
            ],
          },
        })
      }
      if (url === '/api/meta/report-summary') {
        return Promise.resolve({
          data: {
            metrics: {
              valor_usado: 40,
              resultados: 10,
              custo_por_resultado: 4,
              cpc_link: 1,
              ctr_link: 10,
              taxa_video_3s_por_impressoes: 20,
              tx_conversao_envio_mensagem: 25,
              cpm: 100,
              alcance: 200,
              frequencia: 2,
              impressoes: 400,
              cliques_link: 40,
            },
            metric_changes: {},
          },
        })
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Relatorios' })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Filtro de conta de anuncio'))
    fireEvent.click(await screen.findByRole('button', { name: 'Conta Principal (act_1)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Conta Secundaria (act_2)' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Filtro de conta de anuncio')).toHaveTextContent('2')
      expect(screen.getByText('2 contas selecionadas')).toBeInTheDocument()
    })
  })

  it('renders analise estatistica with filters, tabs and modular empty states', async () => {
    setRoute('/app/analise-estatistica')

    api.get.mockImplementation((url) => {
      if (url === '/auth/me/') {
        return Promise.resolve({ data: { authenticated: true, user: { id: 35, username: 'statistics-user' } } })
      }
      if (url === '/api/meta/filters') {
        return Promise.resolve({
          data: {
            ad_accounts: [{ id_meta_ad_account: 'act_1', name: 'Conta Principal' }],
            campaigns: [{ id_meta_campaign: 'cmp_1', name: 'Campanha A', display_name: 'Campanha A - ATIVO' }],
            adsets: [{ id_meta_adset: 'ads_1', name: 'Conjunto A', display_name: 'Conjunto A - ATIVO' }],
            ads: [{ id_meta_ad: 'ad_1', name: 'Anúncio A', display_name: 'Anúncio A - ATIVO' }],
          },
        })
      }
      if (url === '/api/statistics/analysis') {
        return Promise.resolve({
          data: {
            meta: {
              analysis_level: 'ad_account',
              result_semantics: 'Resultados refletem o objetivo configurado na campanha.',
            },
            overview: {
              available: true,
              metrics: [
                {
                  metric: 'spend',
                  label: 'Investimento',
                  current_value: 150,
                  previous_value: 170,
                  percent_change: -11.76,
                  direction: 'negative',
                  interpretation: 'Investimento piorou 11,76% em relação ao período anterior.',
                },
                {
                  metric: 'ctr',
                  label: 'CTR',
                  current_value: 3.2,
                  previous_value: 2.8,
                  percent_change: 14.28,
                  direction: 'positive',
                  interpretation: 'CTR melhorou 14,28% em relação ao período anterior.',
                },
              ],
            },
            stability: { available: false, message: 'Amostra insuficiente.', items: [] },
            funnel: { available: false, message: 'Não há dados suficientes.', steps: [] },
            segments: {
              available: false,
              message: 'Breakdowns de idade, gênero, plataforma e posicionamento não estão persistidos no banco atual.',
              items: [],
            },
            ab_tests: { available: false, message: 'Selecione pelo menos duas entidades.', comparisons: [] },
            saturation: { available: false, message: 'Não há dados suficientes.', items: [] },
            cohorts: { available: false, message: 'Dados comerciais insuficientes para análise de coorte completa.', items: [] },
            trends: { available: false, message: 'Não há série diária.', metrics: [], anomalies: [] },
            correlations: {
              available: true,
              message: '',
              sample_size: 4,
              metrics: [
                { metric: 'spend', label: 'Valor usado' },
                { metric: 'results', label: 'Resultados' },
                { metric: 'ctr', label: 'CTR (cliques no link)' },
              ],
              matrix: [
                {
                  metric: 'spend',
                  label: 'Valor usado',
                  cells: [
                    { metric: 'spend', value: 1, strength: 'muito forte', direction: 'positiva' },
                    { metric: 'results', value: 0.88, strength: 'muito forte', direction: 'positiva' },
                    { metric: 'ctr', value: -0.42, strength: 'moderada', direction: 'negativa' },
                  ],
                },
                {
                  metric: 'results',
                  label: 'Resultados',
                  cells: [
                    { metric: 'spend', value: 0.88, strength: 'muito forte', direction: 'positiva' },
                    { metric: 'results', value: 1, strength: 'muito forte', direction: 'positiva' },
                    { metric: 'ctr', value: null, strength: 'indisponível', direction: 'neutra' },
                  ],
                },
                {
                  metric: 'ctr',
                  label: 'CTR (cliques no link)',
                  cells: [
                    { metric: 'spend', value: -0.42, strength: 'moderada', direction: 'negativa' },
                    { metric: 'results', value: null, strength: 'indisponível', direction: 'neutra' },
                    { metric: 'ctr', value: 1, strength: 'muito forte', direction: 'positiva' },
                  ],
                },
              ],
              unavailable_metrics: [
                {
                  metric: 'delivery',
                  label: 'Veiculação',
                  reason: 'É uma variável categórica.',
                },
              ],
              items: [],
            },
            executive_insights: {
              available: true,
              items: [
                {
                  type: 'info',
                  title: 'Sem alertas estatísticos fortes',
                  description: 'A amostra atual não apresentou evidências suficientes.',
                  evidence: [],
                  suggested_action: 'Monitorar mais dias.',
                },
              ],
            },
          },
        })
      }
      if (url === '/api/statistics/clustering') {
        return Promise.resolve({
          data: {
            available: true,
            summary: {
              total_entities: 6,
              clusters_count: 2,
              most_efficient_cluster_label: 'Grupo promissor',
              highest_risk_cluster_label: 'Alto gasto e baixo retorno',
            },
            features_used: [
              { key: 'spend', label: 'Investimento' },
              { key: 'ctr', label: 'CTR' },
            ],
            warnings: ['A quantidade de clusters foi reduzida para 2 porque a amostra possui apenas 6 entidades.'],
            clusters: [
              {
                cluster_id: 0,
                label: 'Grupo promissor',
                size: 3,
                summary: {
                  avg_ctr: 4.5,
                  avg_results: 18,
                  avg_cost_per_result: 7.2,
                },
                interpretation: 'Grupo com bons sinais de eficiência.',
                suggested_action: 'Avaliar escala gradual.',
              },
              {
                cluster_id: 1,
                label: 'Alto gasto e baixo retorno',
                size: 3,
                summary: {
                  avg_ctr: 1.1,
                  avg_results: 4,
                  avg_cost_per_result: 48,
                },
                interpretation: 'Grupo com investimento alto e baixo retorno.',
                suggested_action: 'Revisar oferta e criativos.',
              },
            ],
            items: [
              {
                id: 'cmp_1',
                name: 'Campanha A',
                cluster_id: 0,
                spend: 120,
                impressions: 3000,
                clicks: 135,
                ctr: 4.5,
                cpc: 0.89,
                results: 18,
                cost_per_result: 6.67,
                conversion_rate: 13.33,
                frequency: 1.8,
                cluster_distance: 0.42,
              },
            ],
            pca: {
              available: false,
              message: 'PCA indisponível no mock.',
              points: [],
            },
            executive_insights: {
              available: true,
              items: [
                {
                  type: 'success',
                  title: 'Cluster promissor encontrado',
                  description: 'Um grupo apresenta boa eficiência relativa.',
                  evidence: ['CTR acima da média'],
                  suggested_action: 'Avaliar escala gradual.',
                },
              ],
            },
          },
        })
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Análise Estatística' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Análise Estatística/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Filtro estatístico de conta')).toBeInTheDocument()
    expect(screen.getByLabelText('Filtro estatístico de campanha')).toBeInTheDocument()
    expect(screen.getByLabelText('Filtro estatístico de conjunto')).toBeInTheDocument()
    expect(screen.getByLabelText('Filtro estatístico de anúncio')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Atualizar análise' })).toBeInTheDocument()
    expect(await screen.findByText('Investimento')).toBeInTheDocument()
    expect(screen.getByText(/150,00/)).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(11)

    fireEvent.click(screen.getByRole('tab', { name: 'Segmentações' }))
    expect(await screen.findByText(/Breakdowns de idade, gênero/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Correlação' }))
    expect(await screen.findByRole('table', { name: 'Matriz de correlação das métricas' })).toBeInTheDocument()
    expect(screen.getByText('4 dias agregados no período selecionado.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Valor usado × Resultados: 0,88/)).toBeInTheDocument()
    expect(screen.getByText('1 métrica fora da matriz')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Clusterização' }))
    expect(await screen.findByRole('heading', { name: 'Clusterização' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tipo de entidade')).toHaveValue('campaign')
    expect(await screen.findByRole('heading', { name: 'Grupo promissor' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Alto gasto e baixo retorno' })).toBeInTheDocument()
    expect(screen.getByText('Campanha A')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(
      '/api/statistics/clustering',
      expect.objectContaining({
        params: expect.objectContaining({
          entity_type: 'campaign',
          algorithm: 'kmeans',
          clusters: 3,
          normalize: true,
        }),
      }),
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Insights Executivos' }))
    expect(await screen.findByText('Cluster promissor encontrado')).toBeInTheDocument()
  })

  it('renders correlation fallback without crashing when only legacy items are returned', async () => {
    setRoute('/app/analise-estatistica')

    api.get.mockImplementation((url) => {
      if (url === '/auth/me/') {
        return Promise.resolve({ data: { authenticated: true, user: { id: 36, username: 'statistics-legacy-user' } } })
      }
      if (url === '/api/meta/filters') {
        return Promise.resolve({
          data: {
            ad_accounts: [{ id_meta_ad_account: 'act_1', name: 'Conta Principal' }],
            campaigns: [],
            adsets: [],
            ads: [],
          },
        })
      }
      if (url === '/api/statistics/analysis') {
        return Promise.resolve({
          data: {
            meta: {
              analysis_level: 'ad_account',
              result_semantics: 'Resultados refletem o objetivo configurado na campanha.',
            },
            overview: {
              available: true,
              metrics: [
                {
                  metric: 'spend',
                  label: 'Investimento',
                  current_value: 150,
                  previous_value: 170,
                  percent_change: -11.76,
                  direction: 'negative',
                  interpretation: 'Investimento piorou 11,76% em relação ao período anterior.',
                },
              ],
            },
            stability: { available: false, message: 'Amostra insuficiente.', items: [] },
            funnel: { available: false, message: 'Não há dados suficientes.', steps: [] },
            segments: { available: false, message: 'Indisponível.', items: [] },
            ab_tests: { available: false, message: 'Indisponível.', comparisons: [] },
            saturation: { available: false, message: 'Indisponível.', items: [] },
            cohorts: { available: false, message: 'Indisponível.', items: [] },
            trends: { available: false, message: 'Indisponível.', metrics: [], anomalies: [] },
            correlations: {
              available: true,
              message: '',
              sample_size: 3,
              items: [
                {
                  metric_x: 'spend',
                  metric_x_label: 'Valor usado',
                  metric_y: 'results',
                  metric_y_label: 'Resultados',
                  correlation: 0.71,
                  strength: 'forte',
                  direction: 'positiva',
                },
                {
                  metric_x: 'results',
                  metric_x_label: 'Resultados',
                  metric_y: 'ctr',
                  metric_y_label: 'CTR (cliques no link)',
                  correlation: -0.22,
                  strength: 'fraca',
                  direction: 'negativa',
                },
              ],
            },
            executive_insights: { available: false, message: 'Sem insights.', items: [] },
          },
        })
      }
      if (url === '/api/statistics/clustering') {
        return Promise.resolve({
          data: {
            available: false,
            message: 'Clusterização não solicitada neste teste.',
            summary: {},
            clusters: [],
            items: [],
            pca: { available: false, message: 'PCA indisponível.', points: [] },
            executive_insights: { available: false, items: [] },
          },
        })
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Análise Estatística' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Correlação' }))

    expect(await screen.findByRole('table', { name: 'Matriz de correlação das métricas' })).toBeInTheDocument()
    expect(screen.getByText('3 dias agregados no período selecionado.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Valor usado × Resultados: 0,71/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Resultados × CTR \(cliques no link\): -0,22/)).toBeInTheDocument()
  })

  it('hides ad filter and renders specific tab data in meta dashboard', async () => {
    setRoute('/app/dashboard-meta')

    api.get.mockImplementation((url) => {
      if (url === '/auth/me/') {
        return Promise.resolve({ data: { authenticated: true, user: { id: 31, username: 'meta-user-specific' } } })
      }
      if (url === '/api/meta/filters') {
        return Promise.resolve({
          data: {
            ad_accounts: [{ id_meta_ad_account: 'act_1', name: 'Conta Principal' }],
            campaigns: [
              {
                id_meta_campaign: 'cmp_1',
                name: 'Campanha A',
                status_display: 'ATIVO',
                display_name: 'Campanha A - ATIVO',
              },
            ],
            adsets: [
              {
                id_meta_adset: 'ads_1',
                name: 'AdSet A',
                status_display: 'DESATIVADO',
                display_name: 'AdSet A - DESATIVADO',
              },
            ],
            ads: [
              { id_meta_ad: 'ad_1', name: 'Ad A', status_display: 'ATIVO', display_name: 'Ad A - ATIVO' },
              { id_meta_ad: 'ad_2', name: 'Ad B', status_display: 'DESATIVADO', display_name: 'Ad B - DESATIVADO' },
            ],
          },
        })
      }
      if (url === '/api/meta/timeseries') {
        return Promise.resolve({ data: { series: [] } })
      }
      if (url === '/api/meta/kpis') {
        return Promise.resolve({ data: { kpis: { gasto_total: 0, impressao_total: 0, alcance_total: 0 } } })
      }
      if (url === '/api/meta/specific-insights') {
        return Promise.resolve({
          data: {
            timeseries_daily: [{ date: '2026-01-02', spend: 32, results: 11 }],
            timeseries_by_ad: [
              {
                ad_id: 'ad_1',
                ad_name: 'Ad A',
                points: [{ date: '2026-01-02', spend: 25, results: 11 }],
              },
              {
                ad_id: 'ad_2',
                ad_name: 'Ad B',
                points: [{ date: '2026-01-02', spend: 7, results: 0 }],
              },
            ],
            rows_by_ad: [
              { ad_id: 'ad_1', ad_name: 'Ad A', results: 11, spend: 25, cpr: 2.2727 },
              { ad_id: 'ad_2', ad_name: 'Ad B', results: 0, spend: 7, cpr: null },
            ],
          },
        })
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`))
    })

    api.post.mockRejectedValue(new Error('No POST expected'))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Dashboard Meta' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Específica' }))

    expect(await screen.findByText('Gasto e resultados por anuncio')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filtro de ads')).not.toBeInTheDocument()
    expect(screen.getByText('Gasto por anúncio')).toBeInTheDocument()
    expect(screen.getByText('Marque a caixinha de cada linha para exibir ou ocultar o anuncio no gráfico.')).toBeInTheDocument()
    expect(screen.getByLabelText('Exibir Ad A no gráfico')).not.toBeChecked()
    expect(screen.getByLabelText('Exibir Ad B no gráfico')).not.toBeChecked()
    expect(screen.getAllByText('Ad A')).toHaveLength(1)
    expect(screen.getAllByText('Ad B')).toHaveLength(1)
    expect(screen.getByText(/25,00/)).toBeInTheDocument()
    expect(screen.getByText('-')).toBeInTheDocument()
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
              seguidores_atuais: 2200,
            },
          },
        })
      }
      if (url === '/api/instagram/timeseries') {
        return Promise.resolve({
          data: {
            timeseries: [
              { date: '2026-02-19', impressions: 1800, reach: 1200, follower_count: 2190 },
              { date: '2026-02-20', impressions: 2200, reach: 1500, follower_count: 2195 },
            ],
          },
        })
      }
      if (url === '/api/meta/sync/99/logs') {
        return Promise.resolve({
          data: {
            sync_run: {
              id: 99,
              status: 'success',
              is_finished: true,
              finished_at: '2026-02-20T12:10:00Z',
            },
            logs: [
              { id: 1, entidade: 'stage', mensagem: '[Facebook Pages] concluido em 1.0s.', timestamp: '2026-02-20T12:00:01Z' },
              {
                id: 2,
                entidade: 'stage',
                mensagem: '[Instagram Business + insights da conta] concluido em 3.0s.',
                timestamp: '2026-02-20T12:00:03Z',
              },
              { id: 3, entidade: 'stage', mensagem: '[Midias + insights das midias] concluido em 6.0s.', timestamp: '2026-02-20T12:00:06Z' },
            ],
            next_since_id: 3,
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

    api.post.mockImplementation((url) => {
      if (url === '/api/instagram/sync-selected') {
        return Promise.resolve({
          data: {
            sync_run_id: 99,
            status: 'pending',
            sync_scope: 'instagram',
          },
        })
      }
      return Promise.reject(new Error(`Unexpected POST ${url}`))
    })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Dashboard Instagram' })).toBeInTheDocument()

    expect(await screen.findByText(/Alcance: 1.000/)).toBeInTheDocument()
    expect(screen.queryByText(/Contas engajadas:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Total de interações:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Impressões:/)).not.toBeInTheDocument()
    expect(screen.getByText(/Seguidores atuais: 2.200/)).toBeInTheDocument()
    expect(screen.getByText(/Seguidores do período: 4\.385/)).toBeInTheDocument()
    expect(screen.getByText('Serie temporal da conta')).toBeInTheDocument()
    expect(screen.getByText('Post de teste')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Filtro de conta Instagram'), { target: { value: 'ig_1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar conta selecionada' }))

    expect(await screen.findByText('Sincronizacao da conta concluida com sucesso.')).toBeInTheDocument()
    expect(screen.getByText('100% concluido')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Reach/ }))

    await waitFor(() => {
      const mediaCalls = api.get.mock.calls.filter(([url]) => url === '/api/instagram/media-table')
      const lastCall = mediaCalls[mediaCalls.length - 1]
      expect(lastCall[1].params.ordering).toBe('-reach')
    })
  })
})
