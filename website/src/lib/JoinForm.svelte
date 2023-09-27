<script>
    import Paper, { Title, Subtitle, Content } from "@smui/paper";
    import Chip, { Set, Text } from "@smui/chips";
    import Fab, { Label, Icon } from "@smui/fab";
    import Accordion, { Panel, Header } from "@smui-extra/accordion";

    let interests = [
        "Ökostrom einspeisen",
        "Ökostrom beziehen",
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

<h3>In vier schnellen Schritten können Sie Teil der Energiewende werden!</h3>


<Accordion>
    <Panel>
        <Header>Schritt 1</Header>
        <Content>
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
        </Content>
    </Panel>
    <Panel>
        <Header>Schritt 2</Header>
        <Content>
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
        </Content>
    </Panel>
    <Panel>
        <Header>Schritt 3</Header>
        <Content>
            Hier müssen Sie noch ein paar Daten eingeben :)
        </Content>
    </Panel>
    <Panel>
        <Header>Schritt 4</Header>
        <Content>
            Zusammenfassung Ihrer Angaben. Wenn alles passt, klicken Sie auf "Los Geht's"
        </Content>
    </Panel>
</Accordion>





<div class="joinbutton">
    <Fab extended href="/" color="primary">
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
