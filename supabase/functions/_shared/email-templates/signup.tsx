/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  userName?: string
}

export const SignupEmail = ({
  confirmationUrl,
  userName,
}: SignupEmailProps) => {
  const firstName = userName ? userName.split(' ')[0] : ''
  const greeting = firstName ? `Fala, ${firstName}!` : 'Fala!'

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Confirme seu email pra ativar o Prospectus</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Confirme seu email pra ativar o Prospectus</Heading>
          <Text style={text}>
            {greeting} Você tá a um clique de ativar o seu Sistema Prospectus.
          </Text>
          <Text style={text}>
            Confirma seu email clicando no botão abaixo pra gente liberar tudo pra você:
          </Text>
          <Button style={button} href={confirmationUrl}>
            Confirmar meu email
          </Button>
          <Text style={footer}>
            Se você não criou essa conta, só ignorar esse email. Sem estresse.
          </Text>
          <Text style={closing}>
            Nos vemos lá dentro. 🤝
          </Text>
          <Text style={signatureName}>Renan Gaspar</Text>
          <Text style={signatureRole}>Prospectus IA - Seu sistema de prospecção Automática</Text>
        </Container>
      </Body>
    </Html>
  )
}

export default SignupEmail

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
const button = {
  backgroundColor: 'hsl(199, 89%, 48%)',
  color: '#0a0f1e',
  fontSize: '14px',
  fontWeight: '600' as const,
  borderRadius: '12px',
  padding: '14px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#94a3b8', margin: '32px 0 0' }
const closing = { fontSize: '15px', color: '#64748b', lineHeight: '1.6', margin: '24px 0 0' }
const signatureName = { fontSize: '14px', color: '#1a1a2e', fontWeight: 'bold' as const, margin: '16px 0 0' }
const signatureRole = { fontSize: '13px', color: '#64748b', margin: '2px 0 0' }
