import { Request, Response } from "express"
import prisma from "../database/prisma"

class PontoController {
  async listar(req: Request, res: Response) {
    try {
      const dataStr = req.query.data as string;
      const dataBuscada = dataStr ? new Date(`${dataStr}T00:00:00Z`) : new Date();
      dataBuscada.setUTCHours(0,0,0,0);
      const dataFim = new Date(dataBuscada);
      dataFim.setUTCDate(dataFim.getUTCDate() + 1);

      const alunos = await prisma.aluno.findMany({
        where: { ativo: true },
        include: {
          enturmacao: { include: { turma: true } },
          entradasaida: {
            where: {
              datahorasys: {
                gte: dataBuscada,
                lt: dataFim
              }
            },
            include: { responsavel: true },
            orderBy: { datahorasys: 'desc' }
          }
        }
      });

      const formatados = alunos.map(a => {
        let turmaNome = '-';
        let turmaId = null;
        if (a.enturmacao && a.enturmacao.length > 0) {
          turmaNome = a.enturmacao[0].turma?.codigoturma || '-';
          turmaId = a.enturmacao[0].idturma || null;
        }

        const eventosHoje = a.entradasaida || [];
        const ultimoEvento = eventosHoje[0];

        let status = 'AUSENTE';
        let responsavel = null;
        let dataHora = null;

        if (ultimoEvento) {
           status = ultimoEvento.descricao || 'AUSENTE';
           responsavel = ultimoEvento.responsavel?.nome || null;
           dataHora = ultimoEvento.datahorasys;
        }

        return {
          id_aluno: a.idaluno,
          nome_aluno: a.nome,
          matricula: a.matricula,
          foto_url: a.foto ? `/uploads/fotos/${Buffer.from(a.foto).toString('utf-8')}` : null,
          id_turma: turmaId,
          turma_nome: turmaNome,
          status: status,
          nome_responsavel: responsavel,
          data_hora: dataHora
        };
      });

      return res.json(formatados);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Erro ao buscar registros de ponto" });
    }
  }

  async registrarEntrada(req: Request, res: Response) {
    try {
      const { id_aluno, observacao } = req.body
      
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const amanha = new Date(hoje);
      amanha.setDate(amanha.getDate() + 1);

      const entradaExistente = await prisma.entradasaida.findFirst({
        where: {
          idaluno: parseInt(id_aluno),
          descricao: "Entrada",
          datahorasys: { gte: hoje, lt: amanha }
        }
      });

      if (entradaExistente) {
        return res.status(400).json({ message: "Entrada já registrada para este aluno hoje." });
      }

      const p = await prisma.entradasaida.create({
        data: {
          idaluno: parseInt(id_aluno),
          descricao: "Entrada",
          datahorasys: new Date(),
          idfuncionario: req.user?.tipo_usuario === 'funcionario' ? req.user.id : undefined
        }
      })

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      const alunoObj = await prisma.aluno.findUnique({ where: { idaluno: parseInt(id_aluno) } });
      await prisma.logsistema.create({
        data: {
          acao: "REGISTRAR_ENTRADA",
          entidade: "Ponto",
          identidade: p.identradasaida,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} registrou entrada do aluno ${alunoObj?.nome || "desconhecido"}.`
        }
      }).catch(() => {});

      return res.status(201).json({ id: p.identradasaida, message: "Entrada registrada" })
    } catch (error) {
      return res.status(400).json({ message: "Erro ao registrar entrada" })
    }
  }

  async validarResponsavel(req: Request, res: Response) {
    try {
      const { id_aluno, cpf } = req.body;
      if (!cpf) {
        return res.status(400).json({ valido: false, message: "CPF não fornecido." });
      }
      const cpfLimpo = cpf.replace(/\D/g, "");
      
      const vinculo = await prisma.responsavelaluno.findFirst({
        where: {
          idaluno: parseInt(id_aluno),
          responsavel: { cpf: cpfLimpo }
        },
        include: { responsavel: true, aluno: true }
      });

      if (!vinculo || !vinculo.responsavel) {
        return res.status(404).json({ valido: false, message: "CPF não pertence a um responsável vinculado a este aluno." });
      }

      return res.json({
        valido: true,
        responsavel: {
          id: vinculo.responsavel.idresponsavel,
          nome: vinculo.responsavel.nome,
          cpf: vinculo.responsavel.cpf,
          parentesco: "Responsável"
        },
        aluno: {
          id: vinculo.aluno.idaluno,
          nome: vinculo.aluno.nome
        },
        message: "Responsável validado com sucesso."
      });
    } catch (error) {
      return res.status(500).json({ valido: false, message: "Erro técnico ao validar responsável" });
    }
  }

  async registrarSaida(req: Request, res: Response) {
    try {
      const { id_aluno, id_responsavel, observacao } = req.body

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const amanha = new Date(hoje);
      amanha.setDate(amanha.getDate() + 1);

      const saidaExistente = await prisma.entradasaida.findFirst({
        where: {
          idaluno: parseInt(id_aluno),
          descricao: "Saída",
          datahorasys: { gte: hoje, lt: amanha }
        }
      });

      if (saidaExistente) {
        return res.status(400).json({ message: "Saída já registrada para este aluno hoje." });
      }

      const p = await prisma.entradasaida.create({
        data: {
          idaluno: parseInt(id_aluno),
          descricao: "Saída",
          datahorasys: new Date(),
          idresponsavel: id_responsavel ? parseInt(id_responsavel) : undefined,
          idfuncionario: req.user?.tipo_usuario === 'funcionario' ? req.user.id : undefined
        }
      })

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      const alunoObj = await prisma.aluno.findUnique({ where: { idaluno: parseInt(id_aluno) } });
      const respObj = id_responsavel ? await prisma.responsavel.findUnique({ where: { idresponsavel: parseInt(id_responsavel) } }) : null;
      const respMsg = respObj ? ` retirado por ${respObj.nome}` : "";
      await prisma.logsistema.create({
        data: {
          acao: "REGISTRAR_SAIDA",
          entidade: "Ponto",
          identidade: p.identradasaida,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} registrou saída do aluno ${alunoObj?.nome || "desconhecido"}${respMsg}.`
        }
      }).catch(() => {});

      return res.status(201).json({ id: p.identradasaida, message: "Saída registrada" })
    } catch (error) {
      return res.status(400).json({ message: "Erro ao registrar saída" })
    }
  }
}

export default new PontoController()
