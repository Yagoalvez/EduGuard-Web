import { Request, Response } from "express"
import prisma from "../database/prisma"

class RotinaController {
  async listar(req: Request, res: Response) {
    try {
      const rotinas = await prisma.rotinachecklist.findMany({
        include: {
          aluno: true,
          funcionario: true,
          checklist: true
        },
        orderBy: { datahorasys: 'desc' }
      })

      const formatadas = rotinas.map(r => ({
        id: r.idrotinachecklist,
        id_aluno: r.idaluno,
        aluno_nome: r.aluno?.nome,
        id_funcionario: r.idfuncionario,
        funcionario_nome: r.funcionario?.nome,
        tipo: r.checklist?.descricao,
        realizado: r.rotinafeita,
        observacao: r.obsden_o,
        data_hora: r.datahorasys
      }))

      return res.json(formatadas)
    } catch (error) {
      return res.status(500).json({ message: "Erro ao buscar rotinas" })
    }
  }

  async registrar(req: Request, res: Response) {
    try {
      const { id_aluno, tipo, observacao, realizado } = req.body
      
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const amanha = new Date(hoje);
      amanha.setDate(amanha.getDate() + 1);

      const entradaHj = await prisma.entradasaida.findFirst({
        where: {
          idaluno: parseInt(id_aluno),
          descricao: "Entrada",
          datahorasys: { gte: hoje, lt: amanha }
        }
      });

      if (!entradaHj) {
        return res.status(400).json({ message: "Não é possível registrar rotina: o aluno não tem registro de entrada hoje." });
      }

      let check = await prisma.checklist.findFirst({ where: { descricao: tipo } })
      if (!check) {
        check = await prisma.checklist.create({ data: { descricao: tipo, ativo: true } })
      }

      const r = await prisma.rotinachecklist.create({
        data: {
          idaluno: parseInt(id_aluno),
          idchecklist: check.idchecklist,
          rotinafeita: realizado,
          obsden_o: observacao,
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
          acao: "REGISTRAR_ROTINA",
          entidade: "Rotina",
          identidade: r.idrotinachecklist,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} registrou a rotina de ${tipo} do aluno ${alunoObj?.nome || "desconhecido"}.`
        }
      }).catch(() => {});

      return res.status(201).json({ id: r.idrotinachecklist, message: "Rotina registrada com sucesso" })
    } catch (error) {
      return res.status(400).json({ message: "Erro ao registrar rotina" })
    }
  }
  async listarPorAluno(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { data } = req.query;

      let where: any = { idaluno: parseInt(id) };

      if (data) {
        const dateObj = new Date(data as string);
        const nextDay = new Date(dateObj);
        nextDay.setDate(nextDay.getDate() + 1);
        where.datahorasys = { gte: dateObj, lt: nextDay };
      }

      const rotinas = await prisma.rotinachecklist.findMany({
        where,
        include: {
          checklist: true
        },
        orderBy: { datahorasys: 'desc' }
      });

      const formatadas = rotinas.map(r => ({
        id: r.idrotinachecklist,
        tipo: r.checklist?.descricao,
        realizado: r.rotinafeita,
        observacao: r.obsden_o,
        data_hora: r.datahorasys
      }));

      return res.json(formatadas);
    } catch (error) {
      return res.status(500).json({ message: "Erro ao buscar rotinas do aluno" });
    }
  }

  async corrigir(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { realizado, observacao } = req.body;
      
      const rotina = await prisma.rotinachecklist.findUnique({ where: { idrotinachecklist: parseInt(id) } });
      if (!rotina) return res.status(404).json({ message: "Rotina não encontrada" });

      // RN-004: Correção apenas no mesmo dia
      const hoje = new Date();
      const rotinaDate = rotina.datahorasys ? new Date(rotina.datahorasys) : null;
      
      if (rotinaDate && (
          hoje.getDate() !== rotinaDate.getDate() || 
          hoje.getMonth() !== rotinaDate.getMonth() || 
          hoje.getFullYear() !== rotinaDate.getFullYear()
      )) {
        return res.status(400).json({ message: "A correção só é permitida na mesma data de criação do registro (RN-004)." });
      }

      await prisma.rotinachecklist.update({
        where: { idrotinachecklist: parseInt(id) },
        data: { rotinafeita: realizado, obsden_o: observacao }
      });

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      const rotinaObj = await prisma.rotinachecklist.findUnique({ where: { idrotinachecklist: parseInt(id) }, include: { aluno: true, checklist: true } });
      await prisma.logsistema.create({
        data: {
          acao: "CORRIGIR_ROTINA",
          entidade: "Rotina",
          identidade: parseInt(id),
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} corrigiu a rotina de ${rotinaObj?.checklist?.descricao || "desconhecida"} do aluno ${rotinaObj?.aluno?.nome || "desconhecido"}.`
        }
      }).catch(() => {});

      return res.json({ message: "Rotina corrigida com sucesso" });
    } catch (error) {
      return res.status(400).json({ message: "Erro ao corrigir rotina" });
    }
  }
}

export default new RotinaController()
