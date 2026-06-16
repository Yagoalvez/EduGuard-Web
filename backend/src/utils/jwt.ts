import jwt from "jsonwebtoken"

interface Payload {
  id: number
  tipo_usuario: string
  funcao?: string
}

export function generateToken(payload: Payload) {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: "7d"
  })
}