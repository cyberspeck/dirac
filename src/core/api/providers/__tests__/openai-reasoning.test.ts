import "should"
import { describe, it } from "mocha"
import { splitThinkTags } from "../openai"

describe("inline think-tag splitting", () => {
	it("routes think content to reasoning and prose to text", () => {
		const result = splitThinkTags("<think>weighing it up</think>Die Antwort lautet …")
		result.reasoning.should.equal("weighing it up")
		result.text.should.equal("Die Antwort lautet …")
	})

	it("handles a think block split across chunks", () => {
		const first = splitThinkTags("<think>partial")
		first.reasoning.should.equal("partial")
		first.text.should.equal("")
		first.state.insideThink.should.equal(true)

		const second = splitThinkTags(" rest</think>done", first.state)
		second.reasoning.should.equal(" rest")
		second.text.should.equal("done")
	})

	it("passes through content with no tags unchanged", () => {
		const result = splitThinkTags("plain answer")
		result.reasoning.should.equal("")
		result.text.should.equal("plain answer")
	})

	it("buffers an opening tag split across chunks", () => {
		const first = splitThinkTags("<thi")
		first.text.should.equal("")
		first.reasoning.should.equal("")
		const second = splitThinkTags("nk>reasoning</think>answer", first.state)
		second.reasoning.should.equal("reasoning")
		second.text.should.equal("answer")
	})

	it("buffers a closing tag split across chunks", () => {
		const first = splitThinkTags("<think>reasoning</thi")
		first.reasoning.should.equal("reasoning")
		const second = splitThinkTags("nk>answer", first.state)
		second.text.should.equal("answer")
		second.reasoning.should.equal("")
	})

	it("does not swallow a bare angle bracket that never becomes a tag", () => {
		const first = splitThinkTags("a < b")
		// trailing "<"-like content may be carried; the flush must recover it
		;(first.text + first.state.carry).should.equal("a < b")
	})

	it("handles empty and adjacent think blocks", () => {
		splitThinkTags("<think></think>text").text.should.equal("text")
		const both = splitThinkTags("<think>one</think><think>two</think>rest")
		both.reasoning.should.equal("onetwo")
		both.text.should.equal("rest")
	})
})
