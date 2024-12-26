const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-discord').Strategy;
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { isatty } = require('tty');

const app = express();
const PORT = 3000;

///////////////
// Middleman //
///////////////

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended:true }));
app.use(express.static(path.join(__dirname, 'public')));


/////////////////////
// Session Startup //
/////////////////////

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
    })
);


////////////////////
// Passport Setup //
////////////////////

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
    new OAuth2Strategy(
        {
            clientID: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
            callbackURL: process.env.DISCORD_REDIRECT_URI,
            scope: ['identify', 'guilds'],
        },
        (accessToken, refreshToken, profile, done) => {
            process.nextTick(() => done(null, profile));
        }
    )
);

app.use(passport.initialize());
app.use(passport.session());


/////////////////////
// Database thingy //
/////////////////////

const db = new sqlite3.Database(path.join(__dirname, '../database/bot.db'), (err) => {
    if (err) console.error('Uh Oh... PupStream Failed to connect to the Database. Error:', err.message);
    console.log('PupStream is successfullt connected to the SQLite database.');
});


///////////////////
// Oauth2 Routes //
///////////////////

app.get('/login', passport.authenticate('discord'));
app.get(
    '/oauth2/callback',
    passport.authenticate('discord', {failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/dashboard');
    }
);

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) console.error(err);
        res.redirect('/');
    });
});


////////////////////
// AUTH MIDDLEMAN //
////////////////////

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next ();
    res.redirect('/login');
}

////////////
// Routes //
////////////

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/dashboard', isAuthenticated, (req, res) => {
    res.send(`
        <h1>Welcome, ${req.user.username}!</h1>
        <p><a href="/guilds">Manage Servers</a></p>
        <p><a href="/logout">Logout</a></p>
        `);
});

app.get('/guilds', isAuthenticated, (req, res) => {
    res.json(req.user.guilds);
})


//////////////////////////////////////
// API for managing Twitch channels //
//////////////////////////////////////

app.get('/channels', (req, res) => {
    db.all('SELECT * FROM channels', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/channels', isAuthenticated, (req, res) => {
    const { twitch_username, custom_announcement, discord_channel_id, is_priority } = req.body;
    db.run(
        `INSERT INTO channels (twitch_username, custom_announcement, discord_channel_id, is_priority)
        VALUES (?, ?, ?, ?)`,
        [twitch_username, custom_announcement, discord_channel_id, is_priority || 0],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.delete('/channels/:id', (req, res) => {
    db.run('DELETE FROM channels WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success:true });
    });
});



//////////////////
// Start server //
//////////////////

app.listen(PORT, () => {
    console.log(`PupStream Web interface is running at http://localhost:${PORT}`);
});