/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de verificação do Prospectus</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Código de verificação</Heading>
        <Text style={text}>Use o código abaixo pra confirmar sua identidade:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Este código expira em breve. Se você não solicitou, pode ignorar este email.
        </Text>
        <Text style={signature}>
          Renan Gaspar, Prospectus
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#1a1a2e',
  margin: '0 0 24px',
}
const text = {
  fontSize: '15px',
  color: '#64748b',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#1a1a2e',
  margin: '0 0 30px',
  letterSpacing: '4px',
}
const footer = { fontSize: '12px', color: '#94a3b8', margin: '32px 0 0' }
const signature = { fontSize: '13px', color: '#64748b', margin: '16px 0 0', fontStyle: 'italic' as const }
