<script>
    // Durchsuchbare Mitglieder-Auswahl: Name oder Nummer eintippen, Treffer
    // aus der Liste waehlen (Maus, Pfeiltasten + Enter). Das gewaehlte
    // Mitglied landet als members_member.id im versteckten Feld `name`.
    import { Input } from "flowbite-svelte";

    /**
     * @type {{
     *   members: { id: number, identifier: number, name: string }[],
     *   name: string,
     *   value: string,
     *   placeholder?: string
     * }}
     */
    let { members, name, value = $bindable(""), placeholder = "Mitglied suchen ..." } = $props();

    let query = $state("");
    let open = $state(false);
    let active = $state(0);

    /** @param {{ identifier: number, name: string }} m */
    const label = (m) => `${m.identifier}: ${m.name}`;

    // Treffer: jedes Wort der Eingabe muss in "Nummer: Name" vorkommen
    let matches = $derived.by(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        return members
            .filter((m) => words.every((w) => label(m).toLowerCase().includes(w)))
            .slice(0, 12);
    });

    /** @param {{ id: number, identifier: number, name: string }} m */
    function pick(m) {
        value = String(m.id);
        query = label(m);
        open = false;
    }

    function onInput() {
        value = "";
        open = true;
        active = 0;
    }

    /** @param {KeyboardEvent} e */
    function onKey(e) {
        if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { open = true; return; }
        if (e.key === "ArrowDown") { active = Math.min(active + 1, matches.length - 1); e.preventDefault(); }
        else if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); e.preventDefault(); }
        else if (e.key === "Enter") { if (matches[active]) pick(matches[active]); e.preventDefault(); }
        else if (e.key === "Escape") { open = false; }
    }
</script>

<div class="relative">
    <input type="hidden" {name} {value} />
    <Input
        type="text"
        bind:value={query}
        {placeholder}
        autocomplete="off"
        oninput={onInput}
        onfocus={() => (open = true)}
        onblur={() => setTimeout(() => (open = false), 150)}
        onkeydown={onKey}
    />
    {#if open && query && matches.length > 0 && !value}
        <ul
            class="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-700"
            role="listbox"
        >
            {#each matches as m, i (m.id)}
                <li role="option" aria-selected={i === active}>
                    <button
                        type="button"
                        class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white {i === active ? 'bg-gray-100 dark:bg-gray-600' : ''}"
                        onmousedown={(e) => e.preventDefault()}
                        onclick={() => pick(m)}
                    >
                        {label(m)}
                    </button>
                </li>
            {/each}
        </ul>
    {:else if open && query && matches.length === 0 && !value}
        <div class="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg dark:border-gray-600 dark:bg-gray-700">
            Kein Mitglied gefunden
        </div>
    {/if}
</div>
