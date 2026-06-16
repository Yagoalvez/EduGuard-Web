import { Request, Response } from "express"
import prisma from "../database/prisma"

class AvisoController {
  async listar(req: Request, res: Response) {
    try {
      let avisos = [];
      if (req.user?.tipo_usuario === 'responsavel') {
        const idResponsavel = req.user.id;
        // Fetch turmas do responsavel
        const vinculos = await prisma.responsavelaluno.findMany({
          where: { idresponsavel: idResponsavel },
          include: { aluno: { include: { enturmacao: true } } }
        });
        const idsTurmas = vinculos.flatMap(v => v.aluno.enturmacao.map(e => e.idturma));
        
        avisos = await prisma.aviso.findMany({
          where: {
            OR: [
              { idturma: null, idresponsavel: null, avisoresposta: { none: {} } }, // geral
              { idturma: { in: idsTurmas } }, // turma
              { idresponsavel: idResponsavel }, // especifico direto
              { avisoresposta: { some: { idresponsavel: idResponsavel } } } // especifico via avisoresposta
            ]
          },
          include: { turma: true, avisoresposta: { include: { responsavel: true } } },
          orderBy: { datacadastro: 'desc' }
        });
      } else {
        avisos = await prisma.aviso.findMany({
          include: { turma: true, avisoresposta: { include: { responsavel: true } } },
          orderBy: { datacadastro: 'desc' }
        });
      }

      const formatados = avisos.map(a => ({
        id: a.idaviso,
        titulo: a.titulo,
        conteudo: a.descricao,
        data_publicacao: a.datacadastro,
        id_turma: a.idturma,
        turma_nome: a.turma?.codigoturma,
        responsaveis_ids: a.avisoresposta?.map(ar => ar.idresponsavel) || [],
        aluno_nome: a.avisoresposta?.length > 0 ? "Responsáveis Específicos" : null,
        respostas: a.avisoresposta.filter(r => r.resposta !== null).map(r => ({
          id: r.idavisoresposta,
          nome_responsavel: r.responsavel?.nome,
          mensagem: r.resposta,
          data_hora: r.dataresposta
        }))
      }));

      return res.json(formatados);
    } catch (error) {
      return res.status(500).json({ message: "Erro ao listar comunicados" });
    }
  }

  async criar(req: Request, res: Response) {
    try {
      const { titulo, conteudo, id_turma, responsaveis } = req.body;
      const aviso = await prisma.aviso.create({
        data: {
          titulo,
          descricao: conteudo,
          idturma: id_turma ? parseInt(id_turma as string) : null,
          datacadastro: new Date()
        }
      });

      if (responsaveis && responsaveis.length > 0) {
        await prisma.avisoresposta.createMany({
          data: responsaveis.map((idR: any) => ({
            idaviso: aviso.idaviso,
            idresponsavel: parseInt(idR as string),
            ciente: false,
            resposta: null
          }))
        });
      }

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      await prisma.logsistema.create({
        data: {
          acao: "CRIAR_COMUNICADO",
          entidade: "Comunicado",
          identidade: aviso.idaviso,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} criou o comunicado '${aviso.titulo}'.`
        }
      }).catch(() => {});

      return res.status(201).json({ id: aviso.idaviso, message: "Aviso criado" });
    } catch (error) {
      return res.status(400).json({ message: "Erro ao criar aviso" });
    }
  }

  async atualizar(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { titulo, conteudo, id_turma, responsaveis } = req.body;
      
      const aviso = await prisma.aviso.update({
        where: { idaviso: parseInt(id) },
        data: {
          titulo,
          descricao: conteudo,
          idturma: id_turma ? parseInt(id_turma as string) : null,
        }
      });

      if (responsaveis) {
        await prisma.avisoresposta.deleteMany({ where: { idaviso: parseInt(id) } });
        if (responsaveis.length > 0) {
          await prisma.avisoresposta.createMany({
            data: responsaveis.map((idR: any) => ({
              idaviso: parseInt(id),
              idresponsavel: parseInt(idR as string),
              ciente: false,
              resposta: null
            }))
          });
        }
      }

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      await prisma.logsistema.create({
        data: {
          acao: "EDITAR_COMUNICADO",
          entidade: "Comunicado",
          identidade: aviso.idaviso,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} editou o comunicado '${aviso.titulo}'.`
        }
      }).catch(() => {});

      return res.json({ message: "Aviso updated" });
    } catch (error) {
      return res.status(400).json({ message: "Erro ao atualizar aviso" });
    }
  }

  async responder(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { mensagem } = req.body;
      const idResponsavel = req.user?.id;

      if (!idResponsavel || req.user?.tipo_usuario !== 'responsavel') {
        return res.status(403).json({ message: "Apenas responsáveis podem responder a comunicados" });
      }

      const existing = await prisma.avisoresposta.findFirst({
        where: {
          idaviso: parseInt(id),
          idresponsavel: idResponsavel
        }
      });

      if (existing) {
        await prisma.avisoresposta.update({
          where: { idavisoresposta: existing.idavisoresposta },
          data: {
            ciente: true,
            resposta: mensagem,
            dataresposta: new Date()
          }
        });
      } else {
        await prisma.avisoresposta.create({
          data: {
            idaviso: parseInt(id),
            idresponsavel: idResponsavel,
            ciente: true,
            resposta: mensagem,
            dataresposta: new Date()
          }
        });
      }

      // Log
      const responsavel = await prisma.responsavel.findUnique({ where: { idresponsavel: idResponsavel } });
      const avisoObj = await prisma.aviso.findUnique({ where: { idaviso: parseInt(id) } });
      await prisma.logsistema.create({
        data: {
          acao: "RESPOSTA_COMUNICADO",
          entidade: "Comunicado",
          identidade: parseInt(id),
          detalhes: `${responsavel?.nome || "Responsável"} respondeu ao comunicado '${avisoObj?.titulo || "desconhecido"}'.`
        }
      }).catch(() => {});

      return res.status(201).json({ message: "Resposta enviada com sucesso" });
    } catch (error) {
      return res.status(400).json({ message: "Erro ao enviar resposta" });
    }
  }

  async excluir(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const loggedUser = req.user;
      
      const avisoExistente = await prisma.aviso.findUnique({
        where: { idaviso: parseInt(id) }
      });
      if (!avisoExistente) {
        return res.status(404).json({ message: "Comunicado não encontrado." });
      }

      await prisma.aviso.delete({
        where: { idaviso: parseInt(id) }
      });

      // Log
      await prisma.logsistema.create({
        data: {
          acao: "EXCLUIR_COMUNICADO",
          entidade: "Comunicado",
          identidade: parseInt(id),
          idfuncionario: loggedUser?.id,
          detalhes: `Comunicado "${avisoExistente.titulo}" excluído.`
        }
      }).catch(() => {});

      return res.json({ message: "Registro removido com sucesso." });
    } catch (error) {
      return res.status(400).json({ message: "Não foi possível remover este registro." });
    }
  }
}

export default new AvisoController();