/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { Tables } from "@/types/database"

export type DataListType =
  | Tables<"chats">[]
  | Tables<"files">[]
  | Tables<"assistants">[]
  | Tables<"models">[]

export type DataItemType =
  | Tables<"chats">
  | Tables<"files">
  | Tables<"assistants">
  | Tables<"models">
