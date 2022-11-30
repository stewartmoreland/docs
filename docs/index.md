# Welcome to DevOops

<script>
window.onload = function(){
    const greetings = [
        "Oh! Hey! Didn't expect to see you here!",
        "Glad you made it. We've got a lot of work to do.",
        "Hey good lookin'! Come here often?",
        "Howdy, partner!",
        "What’s kickin’, chicken?"
    ]

    const random = Math.floor(Math.random() * greetings.length);

    document.getElementById('greeting').innerHTML = greetings[random];
};
</script>

<body>
    <h2 id='greeting'></h2>
</body>

Welcome to my collection of learnings and ramblings. The intent of this project is two fold. First is as a personal reference. I'm very forgetful. Second is to be helpful to anyone else who might have stumbled upon this site. I hope you find something in here that can help you in whatever exciting project you're working on now or next.

If this page has helped you, please consider [buying me a coffee](https://www.buymeacoffee.com/stewmore) :coffee:.
