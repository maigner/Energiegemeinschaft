<script>
    import { formatDate, formatTime } from "$lib/format";
    import { JsonView } from "@zerodevx/svelte-json-view";
    import { Chart } from "@flowbite-svelte-plugins/chart";
    import { Card } from "flowbite-svelte";

    import { onMount } from "svelte";

    let { date, forecast, communityMembers } = $props();

    const today = date;
    today.setHours(0, 0, 0, 0); // set to 00:00:00.000

    const tomorrow = new Date(today); // same day
    tomorrow.setDate(tomorrow.getDate() + 1); // add 1 day
    tomorrow.setHours(0, 0, 0, 0); // reset to midnight

    const forecastToday = forecast.filter(
        (elem) => elem.time >= today && elem.time < tomorrow,
    );

    //fetch energy data
    async function load(day, memberId) {
        const res = await fetch(
            `/api/user/data/byDay?date=${encodeURIComponent(day)}&memberId=${memberId}`,
        );
        const data = await res.json();

        if (!res.ok) {
            // = data.error;
            return null;
        } else {
            data.forEach((obj) => {
                obj.time = new Date(obj.timestamp);
            });

            return data;
        }
    }

    const member = communityMembers[0]; //TODO: select

    let energyData = $state([]);

    onMount(async () => {
        energyData = await load(date, member.id);
    });

    let production = $derived(
        // group energyData by hour

        energyData.filter(
            (e) => e.description === "Gesamte gemeinschaftliche Erzeugung",
        ),
    );

    //Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss
    let overshoot = $derived(
        // group energyData by hour

        energyData.filter(
            (e) => e.description === "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss",
        ),
    );

    let eegInject = $derived(
        production.map((value, index) => {
            return value.sum_over_hour - overshoot[index].sum_over_hour;
        })
    );






    function normalize(value, max) {
        if (Math.abs(max) < 0.000001) return 0.0;
        return value / max;
    }

    let options = $derived({
        chart: {
            height: "400px",
            type: "area",
            fontFamily: "Inter, sans-serif",
            dropShadow: {
                enabled: false,
            },
            toolbar: {
                show: false,
            },
            zoom: {
                enabled: false,
            },
        },
        tooltip: {
            enabled: true,
            x: {
                show: false,
            },
        },
        fill: {
            type: "gradient",
            gradient: {
                opacityFrom: 0.55,
                opacityTo: 0,
                shade: "#1C64F2",
                gradientToColors: ["#1C64F2"],
            },
        },
        dataLabels: {
            enabled: true,
        },
        stroke: {
            width: 6,
        },
        grid: {
            show: false,
            strokeDashArray: 4,
            padding: {
                left: 2,
                right: 2,
                top: 0,
            },
        },
        series: [
            {
                name: "% of max °C",
                //data: [6500, 6418, 6456, 6526, 6356, 6456],
                data: forecastToday.map((e) =>
                    normalize(e.temperature_2m,
                        Math.max(...forecastToday.map((e) => e.temperature_2m))
                    ).toFixed(2),
                ),
                color: "#1A56DB",
            },
            {
                name: "Ges. Gem. Erzeugung: % of 8kW",
                //data: [6500, 6418, 6456, 6526, 6356, 6456],
                data: production.map((e) => normalize(e.sum_over_hour,
                    Math.max(...production.map((e) => e.sum_over_hour))
                ).toFixed(2)),
                color: "#51b827",
            },
            
            {
                name: "Gemeinschaftsüberschuss: % of 8kW",
                //data: [6500, 6418, 6456, 6526, 6356, 6456],
                data: overshoot.map((e) => normalize(e.sum_over_hour,
                    Math.max(...overshoot.map((e) => e.sum_over_hour))
                ).toFixed(2)),
                color: "#b88f27",
            },

            {
                name: "EEG-Einspeisung: % of 8kW",
                //data: [6500, 6418, 6456, 6526, 6356, 6456],
                data: eegInject.map((e) => normalize(e,
                    Math.max(...eegInject)
                ).toFixed(2)),
                color: "#27adb8",
            },
        ],
        xaxis: {
            categories: forecastToday.map((e) => formatTime(e.time)),
            labels: {
                show: true,
            },
            axisBorder: {
                show: false,
            },
            axisTicks: {
                show: false,
            },
        },
        yaxis: {
            show: false,
        },
    });
</script>

<Card class="p-4 md:p-6" size="xl">
    <div class="flex justify-between">
        <div>
            <h5
                class="pb-2 text-3xl leading-none font-bold text-gray-900 dark:text-white"
            >
                {Math.max(...forecastToday.map((e) => e.temperature_2m))}°C
            </h5>
            <p class="text-base font-normal text-gray-500 dark:text-gray-400">
                Tageshöchstwert
            </p>
        </div>
        <div
            class="flex items-center px-2.5 py-0.5 text-center text-base font-semibold text-green-500 dark:text-green-500"
        >
            {formatDate(date)}
        </div>
    </div>
    <Chart {options} />
</Card>

{production[0]?.time}
<br />
{forecastToday[0]?.time}

<JsonView json={eegInject} />
