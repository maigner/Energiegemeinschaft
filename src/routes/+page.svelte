<script>
  import { invoke } from "@tauri-apps/api/core";

  import { Alert } from "flowbite-svelte";

  let name = $state("");
  let greetMsg = $state("");

  /**
   * @param {{ preventDefault: () => void; }} event
   */
  async function greet(event) {
    event.preventDefault();
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsg = await invoke("greet", { name });
  }
</script>

<main class="container">
  <div class="p-32">
    <Alert>
      <span class="font-medium">Info alert!</span>
      Change a few things up and try submitting again.
    </Alert>
  </div>

  <h1>Welcome to Tauri + Svelte</h1>

  <form class="row" onsubmit={greet}>
    <input id="greet-input" placeholder="Enter a name..." bind:value={name} />
    <button type="submit">Greet</button>
  </form>
  <p>{greetMsg}</p>
</main>
