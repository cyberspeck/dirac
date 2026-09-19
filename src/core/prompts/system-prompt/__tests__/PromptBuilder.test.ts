import { expect } from "chai"
import "should"
import { PromptBuilder } from "../registry/PromptBuilder"
import type { SystemPromptContext } from "../types"
import { mockProviderInfo } from "./test-helpers"

describe("PromptBuilder", () => {
	const mockContext: SystemPromptContext = {
		cwd: "/test/project",
		ide: "TestIde",
		supportsBrowserUse: true,
		browserSettings: {
			viewport: {
				width: 1280,
				height: 720,
			},
		},
		isTesting: true,
		providerInfo: mockProviderInfo,
		yoloModeToggled: false,
	}

	describe("postProcess", () => {
		it("should clean up multiple empty lines", async () => {
			const builder = new PromptBuilder(mockContext)
			const result = await builder.build()

			// Should not have more than 2 consecutive newlines
			expect(result).to.not.match(/\n\s*\n\s*\n/)
		})
	})

	describe("skills section", () => {
		it("omits the skills section when no skills are available", async () => {
			const context = { ...mockContext, skills: [] }
			const prompt = await new PromptBuilder(context).build()
			prompt.should.not.containEql("use_skill")
			prompt.should.not.containEql("list_skills")
			prompt.should.not.containEql("AVAILABLE SKILLS")
		})
	})
})
