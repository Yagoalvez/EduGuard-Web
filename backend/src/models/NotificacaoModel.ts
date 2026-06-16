export interface NotificacaoModel {
  idnotificacao: number
  idresponsavel: number | null
  titulo: string | null
  descricao: string | null
  visualizado: boolean | null
  datacriacao: Date | null
}

export interface ContadorNotificacaoModel {
  total: number
}

export interface VisualizarNotificacaoModel {
  message: string
}
