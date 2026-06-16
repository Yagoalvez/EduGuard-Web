export interface AlunoModel {
  idaluno: number
  foto?: Uint8Array | null
  nome: string | null
  datanascimento: Date | null
  matricula: string | null
  ativo: boolean | null
  datacriacao: Date | null
}

export interface TurmaResumoModel {
  idturma: number
  codigoturma: string | null
}

export interface AlunoComTurmaModel extends AlunoModel {
  turma: TurmaResumoModel | null
}
