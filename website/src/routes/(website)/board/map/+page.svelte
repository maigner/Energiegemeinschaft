<script>
    import maplibregl from "maplibre-gl";
    import "maplibre-gl/dist/maplibre-gl.css";
    import { onMount, onDestroy } from "svelte";
    import { Heading } from "flowbite-svelte";

    let { data } = $props();

    /** @type {maplibregl.Map | undefined} */
    let map;
    /** @type {HTMLDivElement} */
    let mapContainer;

    onMount(() => {
        // OpenFreeMap: EU-gehostete OSM-Kacheln, kein API-Key, kein Tracking.
        // Ersetzt Mapbox (US-Anbieter mit Telemetrie), siehe /datenschutz.
        map = new maplibregl.Map({
            container: mapContainer,
            style: "https://tiles.openfreemap.org/styles/liberty",
            center: [13.605, 47.69],
            zoom: 11.5,
            attributionControl: { compact: true },
            // Ein Finger scrollt die Seite weiter, erst zwei Finger bewegen
            // die Karte -- sonst bleibt man am Handy in der Karte haengen.
            cooperativeGestures: true,
            locale: {
                "CooperativeGesturesHandler.MobileHelpText":
                    "Karte mit zwei Fingern verschieben",
                "CooperativeGesturesHandler.WindowsHelpText":
                    "Karte mit Strg + Scrollen zoomen",
                "CooperativeGesturesHandler.MacHelpText":
                    "Karte mit ⌘ + Scrollen zoomen",
            },
        });
        map.addControl(new maplibregl.NavigationControl());

        for (const location of data.memberLocations) {
            if (location.latitude == null || location.longitude == null) {
                continue;
            }
            new maplibregl.Marker()
                .setLngLat([location.longitude, location.latitude])
                .setPopup(new maplibregl.Popup().setText(location.name))
                .addTo(map);
        }
    });

    onDestroy(() => {
        map?.remove();
    });
</script>

<svelte:head>
    <title>ISCHLSTROM - Mitgliederkarte</title>
</svelte:head>

<div class="px-4 mt-4">
    <Heading tag="h2" class="text-xl font-semibold mb-3">
        Mitgliederkarte
    </Heading>
    <div
        bind:this={mapContainer}
        class="h-[65dvh] md:h-[75dvh] w-full rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
    ></div>
</div>
