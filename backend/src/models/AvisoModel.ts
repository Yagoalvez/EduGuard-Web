export interface AvisoModel {
  idaviso: number
  idturma: number | null
  idresponsavel: number | null
  dataentrada: Date | null
  datasaida: Date | null
  titulo: string | null
  descricao: string | null
  datacadastro: Date | null
}
