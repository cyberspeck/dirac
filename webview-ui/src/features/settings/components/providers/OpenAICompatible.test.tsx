import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSettingsStore } from "@/features/settings/store/settingsStore"
import { OpenAICompatibleProvider } from "./OpenAICompatible"

const { handleFieldsChange } = vi.hoisted(() => ({ handleFieldsChange: vi.fn() }))

vi.mock("../utils/useApiConfigurationHandlers", async (importOriginal) => ({
	...(await importOriginal<typeof import("../utils/useApiConfigurationHandlers")>()),
	useApiConfigurationHandlers: () => ({
		handleFieldChange: vi.fn(),
		handleFieldsChange,
		handleModeFieldChange: vi.fn(),
		handleModeFieldsChange: vi.fn(),
	}),
}))

vi.mock("@vscode/webview-ui-toolkit/react", async () => {
	const React = await import("react")
	return {
		VSCodeButton: React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
			({ children, ...props }, ref) => (
				<button ref={ref} {...props}>
					{children}
				</button>
			),
		),
		VSCodeCheckbox: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input type="checkbox" {...props} />,
		VSCodeDropdown: React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
			({ children, ...props }, ref) => (
				<select ref={ref} {...props}>
					{children}
				</select>
			),
		),
		VSCodeOption: (props: React.OptionHTMLAttributes<HTMLOptionElement>) => <option {...props} />,
		VSCodeTextField: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
			({ children: _children, ...props }, ref) => <input ref={ref} {...props} />,
		),
		VSCodeLink: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
	}
})

const profile = (name: string) => ({ name, baseUrl: `http://${name}.test/v1`, modelId: `model-${name}` })

function setState(planActSeparateModelsSetting: boolean) {
	useSettingsStore.setState({
		planActSeparateModelsSetting,
		apiConfiguration: {
			openAiCompatibleProfiles: [profile("A"), profile("B")],
			planModeOpenAiProfileName: "A",
			actModeOpenAiProfileName: "A",
		},
		pendingApiConfigurationUpdates: {},
	})
}

describe("OpenAICompatibleProvider profiles", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		handleFieldsChange.mockResolvedValue(true)
	})

	it("applies a profile selected in Plan to Act too when the modes share a model", async () => {
		setState(false)
		render(<OpenAICompatibleProvider currentMode="plan" showModelOptions={false} />)
		fireEvent.change(screen.getByDisplayValue("A"), { target: { value: "B" } })

		await waitFor(() => expect(handleFieldsChange).toHaveBeenCalled())
		expect(handleFieldsChange.mock.calls[0][0]).toMatchObject({
			planModeOpenAiProfileName: "B",
			actModeOpenAiProfileName: "B",
			planModeOpenAiModelId: "model-B",
			actModeOpenAiModelId: "model-B",
		})
	})

	it("keeps the other mode's profile when Plan and Act are configured separately", async () => {
		setState(true)
		render(<OpenAICompatibleProvider currentMode="plan" showModelOptions={false} />)
		fireEvent.change(screen.getByDisplayValue("A"), { target: { value: "B" } })

		await waitFor(() => expect(handleFieldsChange).toHaveBeenCalled())
		expect(handleFieldsChange.mock.calls[0][0]).toMatchObject({ planModeOpenAiProfileName: "B" })
		expect(handleFieldsChange.mock.calls[0][0]).not.toHaveProperty("actModeOpenAiProfileName")
	})

	it("leaves neither mode on a profile deleted in Plan when the modes share a model", async () => {
		setState(false)
		render(<OpenAICompatibleProvider currentMode="plan" showModelOptions={false} />)
		fireEvent.click(screen.getByTitle("Delete Profile"))

		await waitFor(() => expect(handleFieldsChange).toHaveBeenCalled())
		const patch = handleFieldsChange.mock.calls[0][0]
		expect(patch.openAiCompatibleProfiles.map((p: { name: string }) => p.name)).toEqual(["B"])
		expect(patch).toHaveProperty("planModeOpenAiProfileName", undefined)
		expect(patch).toHaveProperty("actModeOpenAiProfileName", undefined)
	})
})
