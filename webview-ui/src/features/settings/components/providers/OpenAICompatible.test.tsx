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

	describe("field edits", () => {
		const fieldProfile = (name: string, baseUrl: string) => ({
			name,
			baseUrl,
			apiKey: `key-${name}`,
			azureApiVersion: "2024-01-01",
			modelId: `model-${name}`,
		})
		const P1_URL = "https://192.0.2.10:11444/v1"
		const P2_URL = "https://198.51.100.7:11444/v1"
		const NEW_URL = "https://192.0.2.22:11444/v1"

		function setFieldState(planActSeparateModelsSetting: boolean, planProfile: string | undefined, actProfile = planProfile) {
			useSettingsStore.setState({
				planActSeparateModelsSetting,
				apiConfiguration: {
					openAiBaseUrl: P1_URL,
					openAiCompatibleProfiles: [fieldProfile("p1", P1_URL), fieldProfile("p2", P2_URL)],
					planModeOpenAiProfileName: planProfile,
					actModeOpenAiProfileName: actProfile,
				},
				pendingApiConfigurationUpdates: {},
			})
		}

		type Persisted = { openAiCompatibleProfiles?: Array<{ name: string; [key: string]: unknown }>; [key: string]: unknown }
		const lastUpdate = (): Persisted => handleFieldsChange.mock.calls.at(-1)?.[0]
		const byName = (update: Persisted, name: string) => update.openAiCompatibleProfiles?.find((p) => p.name === name)

		it("writes a Base URL edit to the selected profile", async () => {
			setFieldState(false, "p1")
			render(<OpenAICompatibleProvider currentMode="plan" showModelOptions={false} />)
			fireEvent.input(screen.getByPlaceholderText("Enter base URL..."), { target: { value: NEW_URL } })

			await waitFor(() => expect(handleFieldsChange).toHaveBeenCalled())
			const update = lastUpdate()
			expect(update.openAiBaseUrl).toBe(NEW_URL)
			expect(byName(update, "p1")?.baseUrl).toBe(NEW_URL)
			expect(byName(update, "p2")).toEqual(fieldProfile("p2", P2_URL))
		})

		it("writes an API key edit to the selected profile", async () => {
			setFieldState(false, "p1")
			render(<OpenAICompatibleProvider currentMode="plan" showModelOptions={false} />)
			fireEvent.input(screen.getByPlaceholderText("Enter API Key..."), { target: { value: "new-key" } })

			await waitFor(() => expect(handleFieldsChange).toHaveBeenCalled())
			const update = lastUpdate()
			expect(update.openAiApiKey).toBe("new-key")
			expect(byName(update, "p1")?.apiKey).toBe("new-key")
			expect(byName(update, "p2")).toEqual(fieldProfile("p2", P2_URL))
		})

		it("writes an Azure API version edit to the selected profile", async () => {
			setFieldState(false, "p1")
			render(<OpenAICompatibleProvider currentMode="plan" showModelOptions={false} />)
			fireEvent.input(screen.getByPlaceholderText(/^Default: /), { target: { value: "2025-02-02" } })

			await waitFor(() => expect(handleFieldsChange).toHaveBeenCalled())
			const update = lastUpdate()
			expect(update.azureApiVersion).toBe("2025-02-02")
			expect(byName(update, "p1")?.azureApiVersion).toBe("2025-02-02")
			expect(byName(update, "p2")).toEqual(fieldProfile("p2", P2_URL))
		})

		it("writes only the field when no profile is selected", async () => {
			setFieldState(false, undefined)
			render(<OpenAICompatibleProvider currentMode="plan" showModelOptions={false} />)
			fireEvent.input(screen.getByPlaceholderText("Enter base URL..."), { target: { value: NEW_URL } })

			await waitFor(() => expect(handleFieldsChange).toHaveBeenCalled())
			const update = lastUpdate()
			expect(update).toEqual({ openAiBaseUrl: NEW_URL })
			expect(update).not.toHaveProperty("openAiCompatibleProfiles")
		})

		it("writes only the field when the selected profile no longer exists", async () => {
			setFieldState(false, "gone")
			render(<OpenAICompatibleProvider currentMode="plan" showModelOptions={false} />)
			fireEvent.input(screen.getByPlaceholderText("Enter base URL..."), { target: { value: NEW_URL } })

			await waitFor(() => expect(handleFieldsChange).toHaveBeenCalled())
			expect(lastUpdate()).toEqual({ openAiBaseUrl: NEW_URL })
		})

		it("syncs only the current mode's profile when Plan and Act are separate", async () => {
			setFieldState(true, "p1", "p2")
			render(<OpenAICompatibleProvider currentMode="plan" showModelOptions={false} />)
			fireEvent.input(screen.getByPlaceholderText("Enter base URL..."), { target: { value: NEW_URL } })

			await waitFor(() => expect(handleFieldsChange).toHaveBeenCalled())
			const update = lastUpdate()
			expect(byName(update, "p1")?.baseUrl).toBe(NEW_URL)
			expect(byName(update, "p2")?.baseUrl).toBe(P2_URL)
		})
	})
})
