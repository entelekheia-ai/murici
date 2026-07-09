/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use client"

import { logger } from "@/lib/logger"
import { Component, ErrorInfo, ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

// React error boundaries require a class component: there is no hook
// equivalent for getDerivedStateFromError/componentDidCatch.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(error.message, {
      stack: error.stack,
      componentStack: info.componentStack,
      source: "react-error-boundary"
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-center">
          <div className="text-lg font-semibold">Algo deu errado</div>
          <div className="text-muted-foreground text-sm">
            O erro foi registrado. Recarregue a página para continuar.
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
