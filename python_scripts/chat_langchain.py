# Minimal example of wiring the locally hosted llama.cpp server up to
# LangChain, letting the model call a tool, and chatting with it in a loop
# while keeping in-RAM memory of the conversation.
#
# Requires: pip install langchain langchain-openai
#
# llama.cpp's server exposes an OpenAI-compatible API, so we point
# ChatOpenAI at it instead of api.openai.com. Override the server address
# with e.g. LLM_BASE_URL=http://localhost:8080
import os
import time
import uuid

from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver

os.system("")  # enable ANSI color support on Windows terminals

GREEN = "\033[92m"
BLUE = "\033[94m"
GRAY = "\033[90m"
RESET = "\033[0m"

BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:8080")


@tool
def get_weather(city: str) -> str:
    """Look up the current weather for a city. Always use this tool when user asks about weather in some city."""
    if city.strip().lower() == "new york":
        return "It's sunny in New York."
    return f"I don't know the weather for {city}."


llm = ChatOpenAI(
    base_url=f"{BASE_URL}/v1",
    api_key="not-needed",  # llama.cpp server doesn't check this
    model="local-model",   # ignored by llama.cpp, it only ever serves one model
    temperature=0,
    extra_body={"chat_template_kwargs": {"enable_thinking": False}},
)

memory = InMemorySaver()
agent = create_agent(llm, tools=[get_weather], checkpointer=memory)


if __name__ == "__main__":
    chat_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": chat_id}}

    print(f"{GRAY}Chat started (id={chat_id}). Type 'q' to quit.{RESET}\n")
    while True:
        question = input(f"{BLUE}You: {RESET}")
        if question.strip().lower() == "q":
            break

        print(f"{GREEN}Agent: ", end="", flush=True)
        start = time.perf_counter()
        first_token_at = None
        n_chunks = 0
        for token, _metadata in agent.stream(
            {"messages": [{"role": "user", "content": question}]},
            config=config,
            stream_mode="messages",
        ):
            if token.content:
                if first_token_at is None:
                    first_token_at = time.perf_counter()
                print(token.content, end="", flush=True)
                n_chunks += 1
        elapsed = time.perf_counter() - start
        print(RESET)

        ttft = (first_token_at - start) if first_token_at else elapsed
        tps = n_chunks / elapsed if elapsed > 0 else 0.0
        print(f"{GRAY}[{elapsed:.2f}s, {tps:.1f} tok/s, {ttft:.2f}s to first token]{RESET}\n")
