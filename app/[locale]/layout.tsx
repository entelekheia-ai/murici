/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { Toaster } from "@/components/ui/sonner"
import { AgentSessionProvider } from "@/components/utility/agent-session-provider"
import { ChatHandlerProvider } from "@/components/utility/chat-handler-provider"
import { ErrorBoundary } from "@/components/utility/error-boundary"
import { GlobalErrorReporter } from "@/components/utility/global-error-reporter"
import { GlobalState } from "@/components/utility/global-state"
import { Providers } from "@/components/utility/providers"
import TranslationsProvider from "@/components/utility/translations-provider"
import initTranslations from "@/lib/i18n"
import { Metadata, Viewport } from "next"
import { Instrument_Sans, Inter, Ysabeau_SC, Signika } from "next/font/google"
import { ReactNode } from "react"
import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const instrumentSans = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans" })
const ysabeauSc = Ysabeau_SC({ subsets: ["latin"], weight: ["600"], variable: "--font-ysabeau-sc" })
const signika = Signika({ subsets: ["latin"], variable: "--font-signika" })
const APP_NAME = "Murici"
const APP_DEFAULT_TITLE = "Murici"
const APP_TITLE_TEMPLATE = "%s - Murici"
const APP_DESCRIPTION = "Murici"

interface RootLayoutProps {
  children: ReactNode
  params: {
    locale: string
  }
}

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: APP_DEFAULT_TITLE
  },
  formatDetection: {
    telephone: false
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE
    },
    description: APP_DESCRIPTION
  },
  twitter: {
    card: "summary",
    title: {
      default: APP_DEFAULT_TITLE,
      template: APP_TITLE_TEMPLATE
    },
    description: APP_DESCRIPTION
  }
}

export const viewport: Viewport = {
  themeColor: "#000000"
}

const i18nNamespaces = ["translation"]

export default async function RootLayout({
  children,
  params: { locale }
}: RootLayoutProps) {
  const { resources } = await initTranslations(locale, i18nNamespaces)

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${inter.variable} ${instrumentSans.variable} ${ysabeauSc.variable} ${signika.variable} bg-background-app`}>
        <Providers attribute="class" defaultTheme="light" enableSystem>
          <TranslationsProvider
            namespaces={i18nNamespaces}
            locale={locale}
            resources={resources}
          >
            <Toaster richColors position="top-center" duration={3000} />
            <GlobalErrorReporter />
            <div className="flex h-dvh flex-col items-center overflow-x-auto text-foreground">
              <ErrorBoundary>
                <GlobalState>
                  <ChatHandlerProvider>
                    <AgentSessionProvider>{children}</AgentSessionProvider>
                  </ChatHandlerProvider>
                </GlobalState>
              </ErrorBoundary>
            </div>
          </TranslationsProvider>
        </Providers>
      </body>
    </html>
  )
}
