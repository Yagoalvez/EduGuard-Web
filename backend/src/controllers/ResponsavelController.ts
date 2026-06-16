
import ResponsavelService from "../services/ResponsavelService"
import { Request, Response, NextFunction } from "express"
import prisma from "../database/prisma"
import bcrypt from "bcrypt"

class ResponsavelController {
  async listar(req: Request, res: Response) {
    try {
      const responsaveis = await prisma.responsavel.findMany({
        include: {
          responsavelaluno: {
            include: {
              aluno: {
                include: {
                  enturmacao: true
                }
              }
            }
          }
        }
      });
      const formatados = responsaveis.map(r => {
        const turmaIds = r.responsavelaluno
          .flatMap(ra => ra.aluno?.enturmacao?.map(e => String(e.idturma)))
          .filter(Boolean);
        
        return {
          id: r.idresponsavel,
          nome: r.nome,
          cpf: r.cpf,
          email: r.email,
          celular: r.celular,
          ativo: r.ativo,
          master: r.master,
          turma_ids: [...new Set(turmaIds)].join(',')
        }
      });
      return res.json(formatados);
    } catch (error) {
      return res.status(500).json({ message: "Erro ao listar responsáveis" });
    }
  }

  async criar(req: Request, res: Response, next: NextFunction) {
    try {
      const { nome, cpf, celular, email, senha, master } = req.body;
      const isMaster = false;
      const fotoBuffer = req.file ? Buffer.from(req.file.filename, 'utf-8') : null;

      // Chama prisma diretamente ou o Repository
      // Pelo que vejo, a validação de CPF e Email estava jogando erro no frontend que quebrava
      const responsavel = await prisma.responsavel.create({
        data: {
          nome,
          cpf: cpf?.replace(/\D/g, ''),
          celular,
          email,
          senha: await bcrypt.hash(senha || "12345678", 10),
          master: isMaster,
          foto: fotoBuffer,
          ativo: true
        }
      });

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      await prisma.logsistema.create({
        data: {
          acao: "CADASTRAR_RESPONSAVEL",
          entidade: "Responsavel",
          identidade: responsavel.idresponsavel,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} cadastrou o responsável ${responsavel.nome}.`
        }
      }).catch(() => {});

      return res.status(201).json({ id: responsavel.idresponsavel, message: "Responsável criado com sucesso" });
    } catch (error: any) {
      return res.status(400).json({ message: "Erro ao criar responsável. Verifique se o CPF ou Email já existe." });
    }
  }
  async perfil(req: Request, res: Response) {
  const responsavel =
    await ResponsavelService.buscarPerfil(
      req.idResponsavel!
    )

  return res.json(responsavel)
}

async listarMeusAlunos(req: Request, res: Response) {
  const alunos =
    await ResponsavelService.listarAlunosDoResponsavel(
      req.idResponsavel!
    )

  return res.json(alunos)
}

async listarAlunosComTurma(
  req: Request,
  res: Response
) {

  const alunos =
    await ResponsavelService.listarAlunosComTurma(
      req.idResponsavel!
    )

  return res.json(alunos)
}
//edição de perfil
async atualizarPerfil(
  req: Request,
  res: Response
) {

  const { nome, celular, email } =
    req.body

  const responsavel =
    await ResponsavelService.atualizarPerfil(
      req.idResponsavel!,
      {
        nome,
        celular,
        email
      }
    )

  return res.json(responsavel)
}


//responsavel secundário

async criarSecundario(
  req: Request,
  res: Response
) {

  const {
    nome,
    cpf,
    celular,
    email,
    senha
  } = req.body

  const responsavel =
    await ResponsavelService.criarResponsavelSecundario(
      req.idResponsavel!,
      {
        nome,
        cpf,
        celular,
        email,
        senha
      }
    )

  return res.status(201).json(
    responsavel
  )
}


//up de foto

async atualizarFoto(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.file) {
      throw new Error("Foto não enviada")
    }

    const resultado =
      await ResponsavelService.atualizarFoto(
        req.idResponsavel!,
        req.file.buffer
      )

    return res.json(resultado)
  } catch (error) {
    next(error)
  }
}
  async buscarPorId(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const responsavel = await prisma.responsavel.findUnique({
        where: { idresponsavel: parseInt(id) },
        include: {
          responsavelaluno: {
            include: { aluno: true }
          }
        }
      });
      if (!responsavel) return res.status(404).json({ message: "Responsável não encontrado" });

      return res.json({
        id: responsavel.idresponsavel,
        nome: responsavel.nome,
        cpf: responsavel.cpf,
        email: responsavel.email,
        celular: responsavel.celular,
        ativo: responsavel.ativo,
        master: responsavel.master,
        descricao_tipo: responsavel.descricaotipo,
        foto_url: responsavel.foto ? `/uploads/fotos/${Buffer.from(responsavel.foto).toString('utf-8')}` : null,
        alunos: responsavel.responsavelaluno.map(ra => ({
          id: ra.aluno.idaluno,
          nome: ra.aluno.nome,
          matricula: ra.aluno.matricula,
          foto_url: ra.aluno.foto ? `/uploads/fotos/${Buffer.from(ra.aluno.foto).toString('utf-8')}` : null
        }))
      });
    } catch (error) {
      return res.status(500).json({ message: "Erro ao buscar responsável" });
    }
  }

  async atualizar(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { nome, cpf, celular, descricao_tipo, email, master, senha } = req.body;
      
      let data: any = {
        nome, celular, email,
        descricaotipo: descricao_tipo,
        master: false
      };
      
      if (cpf) data.cpf = cpf.replace(/\D/g, '');

      if (senha) {
        data.senha = await bcrypt.hash(senha, 10);
      }
      if (req.file) {
        data.foto = Buffer.from(req.file.filename, 'utf-8');
      }

      const responsavel = await prisma.responsavel.update({
        where: { idresponsavel: parseInt(id) },
        data
      });

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      await prisma.logsistema.create({
        data: {
          acao: "EDITAR_RESPONSAVEL",
          entidade: "Responsavel",
          identidade: responsavel.idresponsavel,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} editou o responsável ${responsavel.nome}.`
        }
      }).catch(() => {});

      return res.json({ message: "Responsável atualizado com sucesso" });
    } catch (error: any) {
      return res.status(400).json({ message: "Erro ao atualizar responsável. Verifique se CPF ou E-mail já existem." });
    }
  }

  async vincularAluno(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { id_aluno } = req.body;
      await prisma.responsavelaluno.create({
        data: {
          idresponsavel: parseInt(id),
          idaluno: parseInt(id_aluno)
        }
      });

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      const respObj = await prisma.responsavel.findUnique({ where: { idresponsavel: parseInt(id) } });
      const alunoObj = await prisma.aluno.findUnique({ where: { idaluno: parseInt(id_aluno) } });
      await prisma.logsistema.create({
        data: {
          acao: "VINCULAR_ALUNO",
          entidade: "Responsavel",
          identidade: parseInt(id),
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} vinculou o responsável ${respObj?.nome || "desconhecido"} ao aluno ${alunoObj?.nome || "desconhecido"}.`
        }
      }).catch(() => {});

      return res.status(201).json({ message: "Aluno vinculado com sucesso" });
    } catch (error) {
      return res.status(400).json({ message: "Erro ao vincular aluno" });
    }
  }

  async desvincularAluno(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const idAluno = req.params.idAluno as string;
      await prisma.responsavelaluno.deleteMany({
        where: {
          idresponsavel: parseInt(id),
          idaluno: parseInt(idAluno)
        }
      });

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      const respObj = await prisma.responsavel.findUnique({ where: { idresponsavel: parseInt(id) } });
      const alunoObj = await prisma.aluno.findUnique({ where: { idaluno: parseInt(idAluno) } });
      await prisma.logsistema.create({
        data: {
          acao: "DESVINCULAR_ALUNO",
          entidade: "Responsavel",
          identidade: parseInt(id),
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} desvinculou o responsável ${respObj?.nome || "desconhecido"} do aluno ${alunoObj?.nome || "desconhecido"}.`
        }
      }).catch(() => {});

      return res.json({ message: "Aluno desvinculado com sucesso" });
    } catch (error) {
      return res.status(400).json({ message: "Erro ao desvincular aluno" });
    }
  }

  async alterarStatus(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { ativo } = req.body;
      const updated = await prisma.responsavel.update({
        where: { idresponsavel: parseInt(id) },
        data: { ativo }
      });
      const action = ativo ? "ativado" : "desativado";

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      const statusStr = ativo ? "ativou" : "desativou";
      await prisma.logsistema.create({
        data: {
          acao: "STATUS_RESPONSAVEL",
          entidade: "Responsavel",
          identidade: updated.idresponsavel,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} ${statusStr} o acesso do responsável ${updated.nome}.`
        }
      }).catch(() => {});

      return res.json({
        message: `Acesso do responsável ${action} com sucesso.`,
        responsavel: {
          id: updated.idresponsavel,
          ativo: updated.ativo
        }
      });
    } catch (error) {
      return res.status(400).json({ message: "Erro ao alterar status" });
    }
  }

  async desativar(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const idresponsavel = parseInt(id);
      const respExistente = await prisma.responsavel.findUnique({
        where: { idresponsavel }
      });
      if (!respExistente) {
        return res.status(404).json({ message: "Responsável não encontrado." });
      }

      const [hasEntradaSaida, hasAviso, hasAvisoResp] = await Promise.all([
        prisma.entradasaida.count({ where: { idresponsavel } }),
        prisma.aviso.count({ where: { idresponsavel } }),
        prisma.avisoresposta.count({ where: { idresponsavel } })
      ]);

      const hasHistory = hasEntradaSaida > 0 || hasAviso > 0 || hasAvisoResp > 0;

      if (hasHistory) {
        await prisma.responsavel.update({
          where: { idresponsavel },
          data: { ativo: false }
        });

        await prisma.logsistema.create({
          data: {
            acao: "EXCLUIR_RESPONSAVEL",
            entidade: "Responsavel",
            identidade: idresponsavel,
            idfuncionario: req.user?.id,
            detalhes: `Responsável ${respExistente.nome} desativado logicamente devido a histórico/vínculos existentes.`
          }
        }).catch(() => {});

        return res.json({ message: "Registro desativado com sucesso. Histórico preservado." });
      } else {
        await prisma.responsavelaluno.deleteMany({ where: { idresponsavel } });
        await prisma.responsavel.delete({ where: { idresponsavel } });

        await prisma.logsistema.create({
          data: {
            acao: "EXCLUIR_RESPONSAVEL",
            entidade: "Responsavel",
            identidade: idresponsavel,
            idfuncionario: req.user?.id,
            detalhes: `Responsável ${respExistente.nome} removido fisicamente.`
          }
        }).catch(() => {});

        return res.json({ message: "Registro removido com sucesso." });
      }
    } catch (error) {
      return res.status(400).json({ message: "Não foi possível remover este registro." });
    }
  }
}

  export default new ResponsavelController()