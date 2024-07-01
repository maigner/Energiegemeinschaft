<script>
    import Project from "$lib/Project.svelte";
    import { Heading, Blockquote } from "flowbite-svelte";
    import { QuoteSolid } from "flowbite-svelte-icons";

</script>

<div class="text-center">
    <Heading tag="h3" class="text-primary-600 mt-16">6. Juli 2024</Heading>
</div>

<div class="flex place-content-center">
    <Project img="/publicmarket.webp" showMore={false}>
        <!--<span slot="title">Stammtisch</span>-->
        <div slot="content">
            <figure class="mx-auto max-w-screen-md text-center">
                <QuoteSolid
                    class="mx-auto mb-3 w-12 h-12 text-gray-400 dark:text-gray-600"
                />
                <Blockquote alignment="center" size="2xl">
                    <p>
                        "Wir freuen uns, ein Teil des
                        <br />
                        <strong>Marktes der Zukunft</strong>
                        <br />
                        zu sein."
                    </p>

                    <p class="mt-4">
                        Der <a href="https://www.salzkammergut-2024.at/projekte/markt-der-zukunft/" target="_blank">Markt der Zukunft Salzkammergut</a>
                        bietet Dialogformate aus Kunst, Wissenschaft, Initiativkultur und Aktivismus. 
                    </p>

                    <p class="mt-4">
                        ISCHL STROM wird am 6. Juli im HAND.WERK.HAUS Salzkammergut in Bad Goisern ebenfalls vertreten sein.
                    </p>

                    <p class="mt-4">
                        "Stellen Sie uns alle Ihre Fragen und erhalten Sie alle
                        Informationen zu unserer Energiegemeinschaft."
                    </p>


                    <p class="mt-4">"Wir freuen uns auf Ihr Kommen!"</p>


                </Blockquote>
                <figcaption
                    class="flex justify-center items-center mt-6 space-x-3 rtl:space-x-reverse"
                >
                    <img
                        class="w-6 rounded-full"
                        src="/people/katharina_thomson.webp"
                        alt="Katharina Thomson"
                    />
                    <div
                        class="flex items-center divide-x-2 rtl:divide-x-reverse divide-gray-500 dark:divide-gray-700"
                    >
                        <cite
                            class="pe-3 font-medium text-gray-900 dark:text-white"
                            >Katharina Thomson</cite
                        >
                        <cite
                            class="ps-3 text-sm font-light text-gray-500 dark:text-gray-400"
                            >Obfrau von ISCHL STROM</cite
                        >
                    </div>
                </figcaption>
            </figure>

<!--
            <div class="flex place-content-center mt-10">
                <p><a href="/faq">Häufig gestellte Fragen</a></p>
            </div>
-->        
        </div>
    </Project>
</div>