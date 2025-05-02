<script>
    import { Mark } from "flowbite-svelte";

    // https://docs.mapbox.com/mapbox-gl-js/example/simple-map/

    // https://docs.mapbox.com/help/tutorials/use-mapbox-gl-js-with-svelte/
    import { Map, Marker, Popup } from "mapbox-gl";
    import "mapbox-gl/dist/mapbox-gl.css";
    import { onMount, onDestroy } from "svelte";

    export let data;

    let map;
    /**
     * @type {HTMLDivElement}
     */
    let mapContainer;
    let lng, lat, zoom;

    lng = 13.605;
    lat = 47.69;
    zoom = 11.5;

    onMount(() => {
        const initialState = { lng: lng, lat: lat, zoom: zoom };

        map = new Map({
            container: mapContainer,
            accessToken: data.mapboxToken,
            style: `mapbox://styles/mapbox/outdoors-v11`,
            center: [initialState.lng, initialState.lat],
            zoom: initialState.zoom,
        });

        console.log(data.memberLocations);

        data.memberLocations.forEach((location) => {
            //console.log(location);
            const el = document.createElement("div");
            el.className = "marker";
            new Marker()
                .setLngLat([location.longitude, location.latitude])
                .setPopup(new Popup().setHTML(`<p>${location.name}</p>`))
                .addTo(map);
        });
    });

    onDestroy(() => {
        map?.remove();
    });
</script>

<div class="">
    <div class="map" bind:this={mapContainer} />

    <!--
    <div class="sidebar">
        Longitude: {lng.toFixed(4)} | Latitude: {lat.toFixed(4)} | Zoom:
        {zoom.toFixed(2)}
    </div>
-->
</div>

<style>
    .map {
        position: absolute;
        width: 95%;
        height: 95%;
        left: 0;
        right: 0;
        border-radius: 10px;
        border-color: rgb(35 55 75 / 90%);
    }
    .sidebar {
        background-color: rgb(35 55 75 / 90%);
        color: #fff;
        padding: 6px 12px;
        font-family: monospace;
        z-index: 1;
        position: absolute;
        top: 16em;
        left: 0;
        margin: 12px;
        border-radius: 4px;
    }
</style>
