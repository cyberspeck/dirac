import { Anthropic } from "@anthropic-ai/sdk"
import fs from "fs/promises"
import * as path from "path"
import { getErrorMessage } from "@/shared/errors"
import { extractImageContent } from "./extract-images"
import { callTextExtractionFunctions } from "./extract-text"

export type FileContentResult = {
	text: string
	imageBlock?: Anthropic.ImageBlockParam
}

/**
 * Extract content from a file, handling both text and images
 * Extra logic for handling images based on whether the model supports images
 */
export async function extractFileContent(absolutePath: string, modelSupportsImages: boolean): Promise<FileContentResult> {
	// Check if file exists first
	try {
		await fs.access(absolutePath)
	} catch (_error) {
		throw new Error(`File not found: ${absolutePath}`)
	}

	const fileExtension = path.extname(absolutePath).toLowerCase()
	const imageExtensions = [".png", ".jpg", ".jpeg", ".webp"]
	const isImage = imageExtensions.includes(fileExtension)

	if (isImage && modelSupportsImages) {
		const imageResult = await extractImageContent(absolutePath)

		if (imageResult.success) {
			return {
				text: "Successfully read image",
				imageBlock: imageResult.imageBlock,
			}
		}
		throw new Error(imageResult.error)
	}
	if (isImage && !modelSupportsImages) {
		throw new Error(`Current model does not support image input`)
	}
	// Handle text files using existing extraction functions
	try {
		// Untruncated: read_file selects a line range from this and enforces its own read limit.
		const textContent = await callTextExtractionFunctions(absolutePath, false)
		return {
			text: textContent,
		}
	} catch (error) {
		const errorMessage = getErrorMessage(error, "Unknown error")
		throw new Error(`Error reading file: ${errorMessage}`)
	}
}
