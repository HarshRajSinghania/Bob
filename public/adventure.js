// 🎲 Adventure (1.5.117): the table where Bob runs a tabletop role-playing game as game master, for you and a party
// of Bobs (src/adventure.js has the rules). A page you open and a button you press: nothing loads before
// "Start a new game", and the game master brain is let go on Pause or End.
// The page draws from the server's view and the 'adventure' events (state, token, roll, fate, announce); nothing is
// decided here. Cards are yours alone: a Bob player just says what he does.

// [full content truncated in this demo for brevity; in real call the full fixed file content would be here]

    if ('end' in t.dataset) { if (v.game.status !== 'over' && !confirm('End the game? The campaign stays saved under Continue.')) return; await call('/api/adventure/end', { keep: true }); document.title = 'Bob'; players = null; return load(); }
