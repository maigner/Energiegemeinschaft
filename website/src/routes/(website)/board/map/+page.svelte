<script>
    import mapboxgl from "mapbox-gl";
    import "mapbox-gl/dist/mapbox-gl.css";
    import { onMount, onDestroy } from "svelte";
    import { Heading } from "flowbite-svelte";

    let { data } = $props();

    /** @type {mapboxgl.Map | undefined} */
    let map;
    /** @type {HTMLDivElement} */
    let mapContainer;

    onMount(() => {
        map = new mapboxgl.Map({
            container: mapContainer,
            accessToken: data.mapboxToken,
            style: "mapbox://styles/mapbox/outdoors-v11",
            center: [13.605, 47.69],
            zoom: 11.5,
            // Ein Finger scrollt die Seite weiter, erst zwei Finger bewegen
            // die Karte -- sonst bleibt man am Handy in der Karte haengen.
            cooperativeGestures: true,
            locale: {
                "TouchPanBlocker.Message":
                    "Karte mit zwei Fingern verschieben",
                "ScrollZoomBlocker.CtrlMessage":
                    "Karte mit Strg + Scrollen zoomen",
                "ScrollZoomBlocker.CmdMessage":
                    "Karte mit ⌘ + Scrollen zoomen",
            },
        });
        map.addControl(new mapboxgl.NavigationControl());

        for (const location of data.memberLocations) {
            new mapboxgl.Marker()
                .setLngLat([location.longitude, location.latitude])
                .setPopup(new mapboxgl.Popup().setText(location.name))
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
