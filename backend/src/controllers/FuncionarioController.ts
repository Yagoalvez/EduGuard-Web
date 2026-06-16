import { Request, Response } from "express"
import prisma from "../database/prisma"
import bcrypt from "bcrypt"

class FuncionarioController {
  async listar(req: Request, res: Response) {
    try {
      const funcionarios = await prisma.funcionario.findMany({
        include: { funcaofuncionario: true }
      })
      
      const formatados = funcionarios.map(f => ({
        id: f.idfuncionario,
        nome: f.nome,
        email: f.email,
        cpf: f.cpf,
        matricula: f.matriculafuncionario,
        id_funcao: f.idfuncao,
        funcao: f.funcaofuncionario?.descricaofuncao,
        ativo: f.ativo,
        foto_url: f.foto ? `/uploads/fotos/${Buffer.from(f.foto).toString('utf-8')}` : null,
      }))
      
      return res.json(formatados)
    } catch (error) {
      return res.status(500).json({ message: "Erro ao buscar funcionários" })
    }
  }

  async criar(req: Request, res: Response) {
    try {
      const { nome, email, cpf, senha, id_funcao } = req.body
      const senhaHash = await bcrypt.hash(senha || "12345678", 10)
      const fotoBuffer = req.file ? Buffer.from(req.file.filename, 'utf-8') : null;

      // Gerar matricula FUN-Ano-Seq
      const ano = new Date().getFullYear();
      const ultimaMatricula = await prisma.funcionario.findFirst({
        where: { matriculafuncionario: { startsWith: `FUN-${ano}-` } },
        orderBy: { matriculafuncionario: 'desc' }
      });
      let seq = 1;
      if (ultimaMatricula && ultimaMatricula.matriculafuncionario) {
        const parts = ultimaMatricula.matriculafuncionario.split('-');
        if (parts.length === 3) seq = parseInt(parts[2]) + 1;
      }
      const matricula = `FUN-${ano}-${seq.toString().padStart(4, '0')}`;

      const f = await prisma.funcionario.create({
        data: {
          nome, email, cpf: cpf?.replace(/\D/g, ''), matriculafuncionario: matricula, 
          senha: senhaHash, idfuncao: parseInt(id_funcao), ativo: true,
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
          acao: "CADASTRAR_FUNCIONARIO",
          entidade: "Funcionario",
          identidade: f.idfuncionario,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} cadastrou o funcionário ${f.nome}.`
        }
      }).catch(() => {});
      
      return res.status(201).json({ id: f.idfuncionario, message: "Funcionário criado com sucesso" })
    } catch (error: any) {
      console.error("Erro ao criar funcionário:", error)
      return res.status(400).json({ message: "Erro ao criar funcionário. Verifique se o CPF ou Email já existe." })
    }
  }

  async atualizar(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { nome, email, cpf, senha, id_funcao } = req.body;
      
      let data: any = { nome, email, idfuncao: parseInt(id_funcao) }
      if (cpf) data.cpf = cpf.replace(/\D/g, '')
      if (senha) data.senha = await bcrypt.hash(senha, 10)
      if (req.file) data.foto = Buffer.from(req.file.filename, 'utf-8')
        
      const f = await prisma.funcionario.update({
        where: { idfuncionario: parseInt(id) },
        data
      })

      // Log
      const loggedUser = req.user;
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      await prisma.logsistema.create({
        data: {
          acao: "EDITAR_FUNCIONARIO",
          entidade: "Funcionario",
          identidade: f.idfuncionario,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} editou o funcionário ${f.nome}.`
        }
      }).catch(() => {});
      
      return res.json({ message: "Funcionário atualizado com sucesso" })
    } catch (error: any) {
      return res.status(400).json({ message: "Erro ao atualizar funcionário. Verifique duplicidade de dados." })
    }
  }

  async alterarStatus(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { ativo } = req.body;
      const idfuncionario = parseInt(id)
      const loggedUser = req.user

      if (idfuncionario === loggedUser?.id) {
        return res.status(400).json({ message: "Você não pode desativar ou apagar seu próprio usuário." })
      }

      const f = await prisma.funcionario.update({
        where: { idfuncionario },
        data: { ativo }
      })

      // Log
      const actor = loggedUser?.tipo_usuario === 'funcionario'
        ? (await prisma.funcionario.findUnique({ where: { idfuncionario: loggedUser.id } }))?.nome || "Funcionário"
        : "Sistema";
      const statusStr = ativo ? "ativou" : "desativou";
      await prisma.logsistema.create({
        data: {
          acao: "STATUS_FUNCIONARIO",
          entidade: "Funcionario",
          identidade: f.idfuncionario,
          idfuncionario: loggedUser?.tipo_usuario === 'funcionario' ? loggedUser.id : null,
          detalhes: `${actor} ${statusStr} o acesso do funcionário ${f.nome}.`
        }
      }).catch(() => {});

      const action = ativo ? "ativado" : "desativado"
      return res.json({ message: `Acesso do funcionário ${action} com sucesso.` })
    } catch (error) {
      return res.status(400).json({ message: "Erro ao alterar status" })
    }
  }
  async listarFuncoes(req: Request, res: Response) {
    try {
      const funcoes = await prisma.funcaofuncionario.findMany()
      return res.json(funcoes)
    } catch (error) {
      return res.status(500).json({ message: "Erro ao buscar funções" })
    }
  }

  async desativar(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const idfuncionario = parseInt(id);
      const loggedUser = req.user;

      if (idfuncionario === loggedUser?.id) {
        return res.status(400).json({ message: "Você não pode desativar ou apagar seu próprio usuário." });
      }

      const funcExistente = await prisma.funcionario.findUnique({
        where: { idfuncionario }
      });
      if (!funcExistente) {
        return res.status(404).json({ message: "Funcionário não encontrado." });
      }

      const [hasEntradaSaida, hasRotina, hasTurma, hasLogs] = await Promise.all([
        prisma.entradasaida.count({ where: { idfuncionario } }),
        prisma.rotinachecklist.count({ where: { idfuncionario } }),
        prisma.turma.count({ where: { idfuncionario } }),
        prisma.logsistema.count({ where: { idfuncionario } })
      ]);

      const hasHistory = hasEntradaSaida > 0 || hasRotina > 0 || hasTurma > 0 || hasLogs > 0;

      if (hasHistory) {
        await prisma.funcionario.update({
          where: { idfuncionario },
          data: { ativo: false }
        });

        await prisma.logsistema.create({
          data: {
            acao: "EXCLUIR_FUNCIONARIO",
            entidade: "Funcionario",
            identidade: idfuncionario,
            idfuncionario: loggedUser?.id,
            detalhes: `Funcionário ${funcExistente.nome} desativado logicamente devido a histórico existente.`
          }
        }).catch(() => {});

        return res.json({ message: "Registro desativado com sucesso. Histórico preservado." });
      } else {
        await prisma.funcionario.delete({
          where: { idfuncionario }
        });

        await prisma.logsistema.create({
          data: {
            acao: "EXCLUIR_FUNCIONARIO",
            entidade: "Funcionario",
            identidade: idfuncionario,
            idfuncionario: loggedUser?.id,
            detalhes: `Funcionário ${funcExistente.nome} removido fisicamente.`
          }
        }).catch(() => {});

        return res.json({ message: "Registro removido com sucesso." });
      }
    } catch (error) {
      return res.status(400).json({ message: "Não foi possível remover este registro." });
    }
  }
}

export default new FuncionarioController()
