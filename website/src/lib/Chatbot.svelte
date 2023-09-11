<script>
    // @ts-nocheck

    import { MDCTopAppBarBaseFoundation } from "@material/top-app-bar";
    import { onMount } from "svelte";
    import ChatBox from "./ChatBox.svelte";
    import Paper from "@smui/paper";
    import Fab, { Icon } from "@smui/fab";
    import { Input } from "@smui/textfield";

    /**
     * @param {string} message
     */
    function ask(message) {
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
                console.log("JSON data:", data);
                answer.text = data.answer.message.content;
                answer.ready = true;
                history = history;
            })
            .catch((error) => {
                // Handle any errors that occurred during the fetch
                console.error("Fetch error:", error);
            });
    }

    onMount(() => {
        console.log("chatbot");
        //ask("Was ist eine Energiegemeinschaft?");
    });

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

<h1>Sprich mit uns!</h1>

    <ChatBox
        who={"we"}
        text={"Hallo! Wie können wir Ihnen helfen?"}
        ready={true}
    />

{#each history as { text, who, ready }}
    <ChatBox {who} {text} {ready} />
{/each}

{#if isThinking === false}
    <div id="inputField">
        <Paper class="solo-paper" elevation={6}>
            <Icon class="material-icons">edit</Icon>
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
                placeholder=""
                class="solo-input"
            />
        </Paper>
        <Fab
            on:click={() => {
                ask(inputValue);
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
