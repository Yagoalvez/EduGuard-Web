import { Request, Response } from "express"
import prisma from "../database/prisma"

class TurmaController {
  async listar(req: Request, res: Response) {
    try {
      const turmas = await prisma.turma.findMany({
        include: {
          funcionario: { select: { nome: true } },
          enturmacao: {
            include: { aluno: true }
          }
        }
      })

      const formatadas = turmas.map(t => ({
        id: t.idturma,
        nome: t.codigoturma,
        capacidade_maxima: t.capacidademaxima,
        turno: t.horaini?.getHours() && t.horaini.getHours() < 12 ? 'Matutino' : 'Vespertino',
        id_funcionario_responsavel: t.idfuncionario,
        professor_nome: t.funcionario?.nome || 'Sem professor',
        alunos: t.enturmacao.map(e => ({
          id: e.aluno.idaluno,
          nome: e.aluno.nome,
          matricula: e.aluno.matricula,
        })),
        vagas_ocupadas: t.enturmacao.length,
        ativo: true
      }))

      return res.json(formatadas)
    } catch (error) {
      return res.status(500).json({ message: "Erro ao buscar turmas" })
    }
  }

  async criar(req: Request, res: Response) {
    try {
      const { codigo_turma, hora_ini, hora_fim, data_ini, capacidade_maxima, id_funcionario_responsavel } = req.body
      const t = await prisma.turma.create({
        data: {
          codigoturma: codigo_turma,
          capacidademaxima: parseInt(capacidade_maxima),
          idfuncionario: id_funcionario_responsavel ? parseInt(id_funcionario_responsavel) : undefined,
          dataini: data_ini ? new Date(data_ini) : new Date(),
          horaini: hora_ini ? new Date(`1970-01-01T${hora_ini}:00Z`) : undefined,
          horafim: hora_fim ? new Date(`1970-01-01T${hora_fim}:00Z`) : undefined
        }
      })

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      await prisma.logsistema.create({
        data: {
          acao: "CRIAR_TURMA",
          entidade: "Turma",
          identidade: t.idturma,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} criou a turma ${t.codigoturma}.`
        }
      }).catch(() => {});

      return res.status(201).json({ id: t.idturma, message: "Turma criada" })
    } catch (error) {
      return res.status(400).json({ message: "Erro ao criar turma" })
    }
  }

  async enturmar(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { id_aluno } = req.body;
      await prisma.enturmacao.create({
        data: { idturma: parseInt(id), idaluno: parseInt(id_aluno), dtmatricula: new Date() }
      })

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      const tObj = await prisma.turma.findUnique({ where: { idturma: parseInt(id) } });
      const alunoObj = await prisma.aluno.findUnique({ where: { idaluno: parseInt(id_aluno) } });
      await prisma.logsistema.create({
        data: {
          acao: "ENTURMAR_ALUNO",
          entidade: "Turma",
          identidade: parseInt(id),
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} vinculou o aluno ${alunoObj?.nome || "desconhecido"} à turma ${tObj?.codigoturma || "desconhecida"}.`
        }
      }).catch(() => {});

      return res.json({ message: "Aluno enturmado" })
    } catch (error) {
      return res.status(400).json({ message: "Erro ao enturmar aluno" })
    }
  }

  async removerAluno(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const idaluno = req.params.idaluno as string;
      await prisma.enturmacao.delete({
        where: { idaluno_idturma: { idaluno: parseInt(idaluno), idturma: parseInt(id) } }
      })

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      const tObj = await prisma.turma.findUnique({ where: { idturma: parseInt(id) } });
      const alunoObj = await prisma.aluno.findUnique({ where: { idaluno: parseInt(idaluno) } });
      await prisma.logsistema.create({
        data: {
          acao: "REMOVER_ALUNO_TURMA",
          entidade: "Turma",
          identidade: parseInt(id),
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} desvinculou o aluno ${alunoObj?.nome || "desconhecido"} da turma ${tObj?.codigoturma || "desconhecida"}.`
        }
      }).catch(() => {});

      return res.json({ message: "Aluno removido" })
    } catch (error) {
      return res.status(400).json({ message: "Erro ao remover aluno" })
    }
  }

  async buscarPorId(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const t = await prisma.turma.findUnique({
        where: { idturma: parseInt(id) },
        include: {
          enturmacao: {
            include: { aluno: true }
          }
        }
      });
      if (!t) return res.status(404).json({ message: "Turma não encontrada" });

      return res.json({
        id: t.idturma,
        nome: t.codigoturma,
        capacidade_maxima: t.capacidademaxima,
        alunos: t.enturmacao.map(e => ({
          id_aluno: e.aluno.idaluno,
          nome_aluno: e.aluno.nome,
          matricula: e.aluno.matricula
        }))
      });
    } catch (error) {
      return res.status(500).json({ message: "Erro ao buscar turma" });
    }
  }
  async atualizar(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { codigo_turma, hora_ini, hora_fim, data_ini, capacidade_maxima, id_funcionario_responsavel } = req.body;
      const t = await prisma.turma.update({
        where: { idturma: parseInt(id) },
        data: {
          codigoturma: codigo_turma,
          capacidademaxima: parseInt(capacidade_maxima),
          idfuncionario: id_funcionario_responsavel ? parseInt(id_funcionario_responsavel) : undefined,
          dataini: data_ini ? new Date(data_ini) : undefined,
          horaini: hora_ini ? new Date(`1970-01-01T${hora_ini}:00Z`) : undefined,
          horafim: hora_fim ? new Date(`1970-01-01T${hora_fim}:00Z`) : undefined
        }
      });

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      await prisma.logsistema.create({
        data: {
          acao: "EDITAR_TURMA",
          entidade: "Turma",
          identidade: t.idturma,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} editou a turma ${t.codigoturma}.`
        }
      }).catch(() => {});

      return res.json({ message: "Turma atualizada" });
    } catch (error) {
      return res.status(400).json({ message: "Erro ao atualizar turma" });
    }
  }

  async deletar(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const tObj = await prisma.turma.findUnique({ where: { idturma: parseInt(id) } });
      await prisma.turma.delete({ where: { idturma: parseInt(id) } });

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      await prisma.logsistema.create({
        data: {
          acao: "DELETAR_TURMA",
          entidade: "Turma",
          identidade: parseInt(id),
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} excluiu a turma ${tObj?.codigoturma || "desconhecida"}.`
        }
      }).catch(() => {});

      return res.json({ message: "Turma excluída" });
    } catch (error) {
      return res.status(400).json({ message: "Erro ao excluir turma" });
    }
  }

  async alterarStatus(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const t = await prisma.turma.findUnique({ where: { idturma: parseInt(id) } });
      if (!t) return res.status(404).json({ message: "Turma não encontrada" });
      return res.json({ message: "Status alterado" });
    } catch (error) {
      return res.status(400).json({ message: "Erro ao alterar status" });
    }
  }
}

export default new TurmaController()
