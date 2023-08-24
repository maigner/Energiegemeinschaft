<script>
    import Paper, { Title, Subtitle, Content } from "@smui/paper";
    import Chip, { Set, Text } from "@smui/chips";

    let choices = [
        "Ökostrom einspeisen",
        "Wärme erzeugen",
        "Ökostrom beziehen",
        "Wärme beziehen",
        "Energie speichern",
        "Energie sparen",
    ];
    /**
     * @type {never[]}
     */
    let selected = [];
</script>

<Paper>
    <Title>Es gibt vielfältige Möglichkeiten der Beteiligung!</Title>
    <Subtitle>Was kann ich tun?</Subtitle>
    <Content>
        <Set chips={choices} let:chip filter bind:selected>
            <Chip {chip} touch>
                <Text>{chip}</Text>
            </Chip>
        </Set>
    </Content>
</Paper>
