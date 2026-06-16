declare namespace Express {
  export interface Request {
    idResponsavel?: number
    user?: {
      id: number
      tipo_usuario: string
      funcao?: string
    }
  }
}