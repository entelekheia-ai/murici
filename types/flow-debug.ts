export interface FlowTurnDebug {
  sequenceNumber: number
  stateAtSend: string
  goal: string | null
  guide: string | null
  teach: string | null
  validIntents: string[]
  sentMessages: any[]
  rawResponse: string
  intentFound: string | null
  transitionEffects: any[]
  toolExchange: Array<{ role: string; content: any }> | null
}
