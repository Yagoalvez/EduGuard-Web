export interface ResponsavelModel {
  idresponsavel: number
  nome: string | null
  cpf: string | null
  senha?: string | null
  foto?: Uint8Array | null
  celular: string | null
  descricaotipo: string | null
  ativo: boolean | null
  datacadastro: Date | null
  email: string | null
  master: boolean | null
}

export interface CreateResponsavelModel {
  nome: string
  cpf: string
  celular: string
  email: string
  senha: string
  master?: boolean
  descricaotipo?: string
}

export interface UpdateResponsavelModel {
  nome?: string
  celular?: string
  email?: string
  descricaotipo?: string
}

export interface ResponsavelSemSenhaModel {
  idresponsavel: number
  nome: string | null
  cpf: string | null
  foto?: Uint8Array | null
  celular: string | null
  descricaotipo: string | null
  ativo: boolean | null
  datacadastro: Date | null
  email: string | null
  master: boolean | null
}
