import {
  File,
  FileText,
  AlertCircle,
  Image as ImageIcon,
  FileSpreadsheet,
  FileJson
} from "lucide-react"
/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { FC } from "react"

interface FileIconProps {
  type: string
  size?: number
}

export const FileIcon: FC<FileIconProps> = ({ type, size = 32 }) => {
  if (type.includes("image")) {
    return <ImageIcon size={size} />
  } else if (type.includes("pdf")) {
    return <FileText size={size} />
  } else if (type.includes("csv")) {
    return <FileSpreadsheet size={size} />
  } else if (type.includes("docx")) {
    return <FileText size={size} />
  } else if (type.includes("plain")) {
    return <FileText size={size} />
  } else if (type.includes("json")) {
    return <FileJson size={size} />
  } else if (type.includes("markdown")) {
    return <FileText size={size} />
  } else {
    return <File size={size} />
  }
}
