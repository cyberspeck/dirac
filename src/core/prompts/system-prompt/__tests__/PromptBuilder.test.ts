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

		const manySkills = Array.from({ length: 12 }, (_, i) => ({
			path: `/skills/skill-${i}`,
			source: "global" as const,
			name: `skill-${i}`,
			description: "test skill",
		}))

		it("omits the list_skills sentence but keeps the overflow count when list_skills is disabled", async () => {
			const context = { ...mockContext, skills: manySkills, listSkillsEnabled: false }
			const prompt = await new PromptBuilder(context).build()
			prompt.should.not.containEql("list_skills")
			prompt.should.containEql("and 2 more")
		})

		it("keeps the list_skills sentence when list_skills is enabled", async () => {
			const context = { ...mockContext, skills: manySkills, listSkillsEnabled: true }
			const prompt = await new PromptBuilder(context).build()
			prompt.should.containEql("list_skills")
		})
	})
})
