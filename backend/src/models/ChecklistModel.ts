export interface ChecklistModel {
  idchecklist: number
  descricao: string | null
  ativo: boolean | null
}

export interface RotinaChecklistModel {
  idrotinachecklist: number
  idchecklist: number | null
  idaluno: number | null
  idfuncionario: number | null
  datahorasys: Date | null
  rotinafeita: boolean | null
  obsden_o?: string | null

  checklist?: ChecklistModel | null

  aluno?: {
    idaluno: number
    nome: string | null
    matricula: string | null
  } | null

  funcionario?: {
    idfuncionario: number
    nome: string | null
  } | null
}
