<script>
    // @ts-nocheck

    import ChatBox from "./ChatBox.svelte";
    import Paper from "@smui/paper";
    import Fab, { Icon } from "@smui/fab";
    import { Input } from "@smui/textfield";

    /**
     * @param {string} message
     */
    function ask(message) {
        notify("Usermessage: " + message);
        let question = addToHistory("you", message, true);
        let answer = addToHistory("we", "", false);

        fetch("/api/chatbot/ask", {
            method: "POST",
            body: JSON.stringify({ message: message }),
            headers: { "Content-Type": "application/json" },
        })
            .then((response) => {
                // Check if the response status is in the 200-299 range (indicating success)
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                // Parse the response body as JSON
                return response.json();
            })
            .then((data) => {
                // Handle the JSON data
                //console.log("JSON data:", data);
                answer.text = data.answer.message.content;
                answer.ready = true;
                history = history;
                //notify("Chatbotresponse: " + answer.text);
            })
            .catch((error) => {
                // Handle any errors that occurred during the fetch
                console.error("Fetch error:", error);
            });
    }

    function notify(message) {
        //TODO: remove after better solution!
        fetch("/api/mail/notify", {
            method: "POST",
            body: JSON.stringify({ message: message }),
            headers: { "Content-Type": "application/json" },
        })
            .then((response) => {
                // Check if the response status is in the 200-299 range (indicating success)
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
            })
            .catch((error) => {
                // Handle any errors that occurred during the fetch
                console.error("Fetch error:", error);
            });
    }

    let inputValue = "";

    let isThinking = false;

    let history = [];

    function addToHistory(who, text, ready) {
        let elem = {
            who: who,
            text: text,
            ready: ready,
        };
        history.push(elem);
        history = history;
        return elem;
    }
</script>


<ChatBox who={"we"} text={"Hallo! Wie können wir Ihnen helfen?"} ready={true} />

{#each history as { text, who, ready }}
    <ChatBox {who} {text} {ready} />
{/each}

{#if isThinking === false}
    <!-- TODO: better text input on phone! -->

    <div id="inputField">
        <Paper class="solo-paper" elevation={6}>
            <Input
                bind:value={inputValue}
                on:keydown={(event) => {
                    if (event.key === "Enter") {
                        // Do something with the inputValue
                        // console.log("Enter key pressed. Value:", inputValue);
                        ask(inputValue);
                        inputValue = "";
                    }
                }}
                placeholder="Stellen Sie Ihre Frage"
                class="solo-input"
            />
        </Paper>
        <Fab
            on:click={() => {
                ask(inputValue);
                inputValue = "";
            }}
            color="primary"
            mini
            class="solo-fab"
        >
            <Icon class="material-icons">send</Icon>
        </Fab>
    </div>
{/if}

<style>
    #inputField {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    * :global(.solo-input) {
        margin-left: 12px;
        width: 16em;
        color: var(--mdc-theme-on-surface, #000);
    }
    * :global(.solo-input::placeholder) {
        color: var(--mdc-theme-on-surface, #000);
        opacity: 0.6;
    }
    * :global(.solo-fab) {
        flex-shrink: 0;
    }
</style>
