import { Request, Response, NextFunction } from "express"
import AlunoService from "../services/AlunoService"
import prisma from "../database/prisma"

class AlunoController {
  async getMeusAlunos(req: Request, res: Response, next: NextFunction) {
    try {
      const idresponsavel = req.idResponsavel;

      if (!idresponsavel) {
        return res.status(401).json({ message: "Usuário não autenticado." });
      }

      const alunos = await AlunoService.getMeusAlunos(idresponsavel)

      return res.status(200).json(alunos)
    } catch (error) {
      next(error)
    }
  }

  async listarTodos(req: Request, res: Response, next: NextFunction) {
    try {
      const alunos = await prisma.aluno.findMany({
        where: { ativo: true },
        include: {
          enturmacao: { include: { turma: true } },
          responsavelaluno: { include: { responsavel: true } }
        }
      })

      const formatados = alunos.map(a => ({
        id: a.idaluno,
        nome: a.nome,
        matricula: a.matricula,
        data_nascimento: a.datanascimento,
        ativo: a.ativo,
        turma_nome: a.enturmacao[0]?.turma?.codigoturma || null,
        id_turma: a.enturmacao[0]?.idturma || null,
        responsaveis: a.responsavelaluno.map(r => ({
          id: r.responsavel.idresponsavel,
          nome: r.responsavel.nome
        }))
      }))

      return res.json(formatados)
    } catch (error) {
      next(error)
    }
  }

  async buscarPorId(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const aluno = await prisma.aluno.findUnique({
        where: { idaluno: parseInt(id) },
        include: {
          enturmacao: { include: { turma: true } },
          responsavelaluno: { include: { responsavel: true } }
        }
      });

      if (!aluno) return res.status(404).json({ message: "Aluno não encontrado" });

      return res.json({
        id: aluno.idaluno,
        nome: aluno.nome,
        matricula: aluno.matricula,
        data_nascimento: aluno.datanascimento,
        ativo: aluno.ativo,
        foto_url: aluno.foto ? `/uploads/fotos/${Buffer.from(aluno.foto).toString('utf-8')}` : null,
        turma_nome: aluno.enturmacao[0]?.turma?.codigoturma || null,
        id_turma: aluno.enturmacao[0]?.idturma || null,
        responsaveis: aluno.responsavelaluno.map(r => ({
          id: r.responsavel.idresponsavel,
          nome: r.responsavel.nome
        }))
      });
    } catch (error) {
      next(error);
    }
  }

  async criar(req: Request, res: Response, next: NextFunction) {
    try {
      const { nome, data_nascimento } = req.body
      const foto = req.file ? req.file.filename : null;

      const anoAtual = new Date().getFullYear();
      const prefixo = `EG-${anoAtual}-`;

      // Encontrar a última matrícula deste ano
      const ultimoAluno = await prisma.aluno.findFirst({
        where: { matricula: { startsWith: prefixo } },
        orderBy: { matricula: 'desc' }
      });

      let proximaSequencia = 1;
      if (ultimoAluno && ultimoAluno.matricula) {
        const partes = ultimoAluno.matricula.split('-');
        if (partes.length === 3) {
          proximaSequencia = parseInt(partes[2], 10) + 1;
        }
      }

      const matricula = `${prefixo}${proximaSequencia.toString().padStart(4, '0')}`;

      const fotoBuffer = req.file ? Buffer.from(req.file.filename, 'utf-8') : null;

      const aluno = await prisma.aluno.create({
        data: {
          nome, matricula, datanascimento: new Date(data_nascimento), ativo: true,
          foto: fotoBuffer
        }
      })

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      await prisma.logsistema.create({
        data: {
          acao: "CADASTRAR_ALUNO",
          entidade: "Aluno",
          identidade: aluno.idaluno,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} cadastrou o aluno ${aluno.nome}.`
        }
      }).catch(() => {});

      return res.status(201).json({ id: aluno.idaluno, matricula: aluno.matricula })
    } catch (error) {
      next(error)
    }
  }

  async atualizar(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { nome, matricula, data_nascimento } = req.body
      let data: any = { nome, matricula, datanascimento: new Date(data_nascimento) }
      if (req.file) data.foto = Buffer.from(req.file.filename, 'utf-8')

      const aluno = await prisma.aluno.update({
        where: { idaluno: parseInt(id) },
        data
      })

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      await prisma.logsistema.create({
        data: {
          acao: "EDITAR_ALUNO",
          entidade: "Aluno",
          identidade: aluno.idaluno,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} editou o aluno ${aluno.nome}.`
        }
      }).catch(() => {});

      return res.json({ message: "Aluno atualizado" })
    } catch (error) {
      next(error)
    }
  }

  async alterarStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { ativo } = req.body;
      const aluno = await prisma.aluno.update({
        where: { idaluno: parseInt(id) },
        data: { ativo }
      });

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      const statusStr = ativo ? "ativou" : "desativou";
      await prisma.logsistema.create({
        data: {
          acao: "STATUS_ALUNO",
          entidade: "Aluno",
          identidade: aluno.idaluno,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} ${statusStr} o aluno ${aluno.nome}.`
        }
      }).catch(() => {});

      return res.json({ message: "Status do aluno alterado com sucesso" });
    } catch (error: any) {
      return res.status(400).json({ message: "Erro ao alterar status do aluno" });
    }
  }


  async vincularResponsavel(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const id_responsavel = req.body.id_responsavel as string;
      await prisma.responsavelaluno.create({
        data: {
          idaluno: parseInt(id),
          idresponsavel: parseInt(id_responsavel)
        }
      });

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      const alunoObj = await prisma.aluno.findUnique({ where: { idaluno: parseInt(id) } });
      const respObj = await prisma.responsavel.findUnique({ where: { idresponsavel: parseInt(id_responsavel) } });
      await prisma.logsistema.create({
        data: {
          acao: "VINCULAR_RESPONSAVEL",
          entidade: "Aluno",
          identidade: parseInt(id),
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} vinculou o responsável ${respObj?.nome || "desconhecido"} ao aluno ${alunoObj?.nome || "desconhecido"}.`
        }
      }).catch(() => {});

      return res.status(201).json({ message: "Responsável vinculado com sucesso" });
    } catch (error) {
      return res.status(400).json({ message: "Erro ao vincular responsável" });
    }
  }

  async desvincularResponsavel(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const idResp = req.params.idResp as string;
      await prisma.responsavelaluno.deleteMany({
        where: {
          idaluno: parseInt(id),
          idresponsavel: parseInt(idResp)
        }
      });

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      const alunoObj = await prisma.aluno.findUnique({ where: { idaluno: parseInt(id) } });
      const respObj = await prisma.responsavel.findUnique({ where: { idresponsavel: parseInt(idResp) } });
      await prisma.logsistema.create({
        data: {
          acao: "DESVINCULAR_RESPONSAVEL",
          entidade: "Aluno",
          identidade: parseInt(id),
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} desvinculou o responsável ${respObj?.nome || "desconhecido"} do aluno ${alunoObj?.nome || "desconhecido"}.`
        }
      }).catch(() => {});

      return res.json({ message: "Responsável desvinculado com sucesso" });
    } catch (error) {
      return res.status(400).json({ message: "Erro ao desvincular responsável" });
    }
  }

  async desativar(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const idaluno = parseInt(id);
      
      const alunoExistente = await prisma.aluno.findUnique({
        where: { idaluno }
      });
      
      if (!alunoExistente) {
        return res.status(404).json({ message: "Não foi possível encontrar este aluno." });
      }

      const [hasEntradaSaida, hasRotina, hasEnturmacao] = await Promise.all([
        prisma.entradasaida.count({ where: { idaluno } }),
        prisma.rotinachecklist.count({ where: { idaluno } }),
        prisma.enturmacao.count({ where: { idaluno } })
      ]);

      const hasHistory = hasEntradaSaida > 0 || hasRotina > 0 || hasEnturmacao > 0;

      if (hasHistory) {
        await prisma.aluno.update({
          where: { idaluno },
          data: { ativo: false }
        });
        
        await prisma.logsistema.create({
          data: {
            acao: "EXCLUIR_ALUNO",
            entidade: "Aluno",
            identidade: idaluno,
            idfuncionario: req.user?.id,
            detalhes: `Aluno ${alunoExistente.nome} desativado logicamente devido a histórico existente.`
          }
        }).catch(() => {});

        return res.json({ message: "Registro desativado com sucesso. Histórico preservado." });
      } else {
        await prisma.responsavelaluno.deleteMany({ where: { idaluno } });
        await prisma.aluno.delete({ where: { idaluno } });

        await prisma.logsistema.create({
          data: {
            acao: "EXCLUIR_ALUNO",
            entidade: "Aluno",
            identidade: idaluno,
            idfuncionario: req.user?.id,
            detalhes: `Aluno ${alunoExistente.nome} removido fisicamente.`
          }
        }).catch(() => {});

        return res.json({ message: "Registro removido com sucesso." });
      }
    } catch (error) {
      return res.status(400).json({ message: "Não foi possível remover este registro." });
    }
  }
}

export default new AlunoController()
