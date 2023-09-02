<script>
    import Paper, { Title, Subtitle, Content } from "@smui/paper";
    import Chip, { Set, Text } from "@smui/chips";
    import Fab, { Label, Icon } from "@smui/fab";


    let interests = [
        "Ökostrom einspeisen",
        "Ökostrom beziehen",
        "ökologisch Heizen",
        "Energie speichern",
        "Energie sparen",
    ];
    /**
     * @type {never[]}
     */
    let selectedInterests = [];


    let questions = [
        "PV Anbieter",
        "E-Mobilität",
        "Wahl der Heizung",
        "Energie sparen",
    ];
    /**
     * @type {never[]}
     */
    let selectedQuestions = [];
</script>

<Paper>
    <Title>Ich möchte:</Title>
    <Subtitle>Wählen Sie ihre Interessensgebiete?</Subtitle>
    <Content>
        <Set
            chips={interests}
            let:chip
            filter
            bind:selected={selectedInterests}
        >
            <Chip {chip} touch>
                <Text>{chip}</Text>
            </Chip>
        </Set>
    </Content>
</Paper>


<Paper>
    <Title>Ich brauche:</Title>
    <Subtitle>Wie können wir Sie unterstützen?</Subtitle>
    <Content>
        <Set
            chips={questions}
            let:chip
            filter
            bind:selected={selectedQuestions}
        >
            <Chip {chip} touch>
                <Text>{chip}</Text>
            </Chip>
        </Set>
    </Content>
</Paper>


<div class="joinbutton">
    <Fab
        extended
        href="/"
        color="primary"
    >
        <Label>Los geht's!</Label>
    </Fab>
</div>

<style>
    .joinbutton {
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 20px;
    }
</style>