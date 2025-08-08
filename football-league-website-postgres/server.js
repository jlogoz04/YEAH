import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import basicAuth from 'express-basic-auth';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Postgres (Neon) connection
// Set DATABASE_URL in env, e.g. postgres://USER:PASSWORD@HOST/dbname?sslmode=require
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

async function init() {
  // Create tables
  await pool.query(`CREATE TABLE IF NOT EXISTS teams (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color1 TEXT NOT NULL,
    color2 TEXT NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fixtures (
    id SERIAL PRIMARY KEY,
    round INTEGER NOT NULL,
    home_code TEXT NOT NULL REFERENCES teams(code),
    away_code TEXT NOT NULL REFERENCES teams(code),
    home_goals INTEGER,
    away_goals INTEGER
  )`);

  // Seed teams
  const { rows: [{ c: teamCount }] } = await pool.query('SELECT COUNT(*)::int AS c FROM teams');
  if (teamCount === 0) {
    const teams = [
      ['TIG','Camden Tigers','#FF8C00','#000000'],
      ['CAM','Camden Falcons','#D40000','#000000'],
      ['OPR','Oran Park Rovers','#FFFFFF','#000000'],
      ['HAR','Harrington United','#32CD32','#001F3F'],
      ['ESC','Eschol Park Wolves','#800000','#FFD700'],
      ['TAH','Tahmoor SC','#006A4E','#FFFFFF'],
      ['GSC','Gunners SC','#D40000','#FFFFFF'],
      ['NAR','Narellan Rangers','#4169E1','#D40000'],
      ['STM','St Marys Eaglevale','#DAA520','#006400'],
      ['GRH','Gregory Hills Stallions','#800080','#FFD700']
    ];
    const values = teams.map((_, i) => `($${i*4+1}, $${i*4+2}, $${i*4+3}, $${i*4+4})`).join(',');
    await pool.query(
      `INSERT INTO teams(code,name,color1,color2) VALUES ${values}`,
      teams.flat()
    );
  }

  // Seed fixtures
  const { rows: [{ c: fxCount }] } = await pool.query('SELECT COUNT(*)::int AS c FROM fixtures');
  if (fxCount === 0) {
    const parse = (round, list) => list.map(pair => {
      const [home, away] = pair.split('v');
      return { round, home: home.trim().replace(/\s/g,''), away: away.trim().replace(/\s/g,'') };
    });
    const rounds = [
      parse(1,  ['TAH v TIG','STM v ESC','OPR v GRH','GSC v CAM','NAR v HAR']),
      parse(2,  ['NAR v GRH','CAM v TIG','HAR v GSC','TAH v STM','ESC v OPR']),
      parse(3,  ['GSC v GRH','NAR v ESC','OPR v STM','TAH v CAM','TIG v HAR']),
      parse(4,  ['STM v NAR','OPR v TAH','GRH v TIG','HAR v CAM','ESC v GSC']),
      parse(5,  ['STM v GSC','TIG v ESC','TAH v HAR','NAR v OPR','CAM v GRH']),
      parse(6,  ['NAR v TAH','OPR v GSC','STM v TIG','GRH v HAR','ESC v CAM']),
      parse(7,  ['HAR v ESC','GSC v NAR','CAM v STM','TAH v GRH','TIG v OPR']),
      parse(8,  ['NAR v TIG','OPR v CAM','GSC v TAH','ESC v GRH','STM v HAR']),
      parse(9,  ['TIG v GSC','GRH v STM','HAR v OPR','TAH v ESC','CAM v NAR']),
      parse(10, ['TIG v TAH','GRH v OPR','HAR v NAR','ESC v STM','CAM v GSC']),
      parse(11, ['TIG v CAM','STM v TAH','GRH v NAR','GSC v HAR','OPR v ESC']),
      parse(12, ['STM v OPR','GRH v GSC','ESC v NAR','HAR v TIG','CAM v TAH']),
      parse(13, ['TIG v GRH','TAH v OPR','NAR v STM','GSC v ESC','CAM v HAR']),
      parse(14, ['GRH v CAM','OPR v NAR','ESC v TIG','HAR v TAH','GSC v STM']),
      parse(15, ['TAH v NAR','TIG v STM','HAR v GRH','GSC v OPR','CAM v ESC']),
      parse(16, ['STM v CAM','GRH v TAH','NAR v GSC','OPR v TIG','ESC v HAR']),
      parse(17, ['TAH v GSC','TIG v NAR','GRH v ESC','HAR v STM','CAM v OPR']),
      parse(18, ['GSC v TIG','STM v GRH','NAR v CAM','OPR v HAR','ESC v TAH'])
    ];
    const all = rounds.flat();
    const values = all.map((_, i) => `($${i*3+1}, $${i*3+2}, $${i*3+3})`).join(',');
    await pool.query(
      `INSERT INTO fixtures(round,home_code,away_code) VALUES ${values}`,
      all.flatMap(m => [m.round, m.home, m.away])
    );
  }
}

async function getAllTeams(){
  const { rows } = await pool.query('SELECT * FROM teams ORDER BY name');
  return rows;
}
async function getAllFixtures(){
  const { rows } = await pool.query(`
    SELECT f.*, th.name AS home_name, ta.name AS away_name
    FROM fixtures f
    JOIN teams th ON f.home_code = th.code
    JOIN teams ta ON f.away_code = ta.code
    ORDER BY round, id
  `);
  return rows;
}
async function getFixturesForRound(round){
  const { rows } = await pool.query(`
    SELECT f.*, th.name AS home_name, ta.name AS away_name,
           th.color1 AS h1, th.color2 AS h2, ta.color1 AS a1, ta.color2 AS a2
    FROM fixtures f
    JOIN teams th ON f.home_code = th.code
    JOIN teams ta ON f.away_code = ta.code
    WHERE round = $1
    ORDER BY id
  `, [round]);
  return rows;
}

// Ladder & stats logic
function computeLadderForRound(round, teams, fixtures){
  const table = {};
  teams.forEach(t => table[t.code] = { code:t.code, name:t.name, played:0,wins:0,draws:0,losses:0,gf:0,ga:0,gd:0,pts:0 });
  fixtures.filter(m => m.round <= round && m.home_goals !== null && m.away_goals !== null).forEach(m => {
    const home = table[m.home_code];
    const away = table[m.away_code];
    const hg = Number(m.home_goals);
    const ag = Number(m.away_goals);
    home.played++; away.played++;
    home.gf += hg; home.ga += ag;
    away.gf += ag; away.ga += hg;
    if (hg>ag){ home.wins++; away.losses++; home.pts+=3; }
    else if (hg<ag){ away.wins++; home.losses++; away.pts+=3; }
    else { home.draws++; away.draws++; home.pts++; away.pts++; }
  });
  Object.values(table).forEach(t => t.gd = t.gf - t.ga);
  const sorted = Object.values(table).sort((a,b)=> b.pts-a.pts || b.gd-a.gd || b.gf-a.gf || a.ga-b.ga);
  sorted.forEach((t,i)=> t.pos=i+1);
  return sorted;
}

async function computePositionsByRound(){
  const teams = await getAllTeams();
  const fixtures = await getAllFixtures();
  const positions = {}; teams.forEach(t => positions[t.code]=[]);
  for(let r=1;r<=18;r++){
    const table=computeLadderForRound(r,teams,fixtures);
    const posMap={}; table.forEach(t=>posMap[t.code]=t.pos);
    teams.forEach(t=>positions[t.code].push(posMap[t.code]));
  }
  return { teams, positions };
}

async function computeStats(){
  const fixtures = await getAllFixtures();
  const played = fixtures.filter(f => f.home_goals !== null && f.away_goals !== null);
  const teams = await getAllTeams();
  const agg = {}; teams.forEach(t => agg[t.code]={wins:0,draws:0,losses:0,gf:0,ga:0});
  played.forEach(m=>{
    const hg=Number(m.home_goals), ag=Number(m.away_goals);
    agg[m.home_code].gf+=hg; agg[m.home_code].ga+=ag;
    agg[m.away_code].gf+=ag; agg[m.away_code].ga+=hg;
    if(hg>ag){ agg[m.home_code].wins++; agg[m.away_code].losses++; }
    else if(hg<ag){ agg[m.away_code].wins++; agg[m.home_code].losses++; }
    else { agg[m.home_code].draws++; agg[m.away_code].draws++; }
  });
  let maxTotal=-1; played.forEach(m=>maxTotal=Math.max(maxTotal,Number(m.home_goals)+Number(m.away_goals)));
  const highestScorelines = played.filter(m=>Number(m.home_goals)+Number(m.away_goals)===maxTotal);
  let maxDiff=-1; played.forEach(m=>maxDiff=Math.max(maxDiff,Math.abs(Number(m.home_goals)-Number(m.away_goals))));
  const biggestWins = played.filter(m=>Math.abs(Number(m.home_goals)-Number(m.away_goals))===maxDiff);
  const metricMax = metric=>{
    let max=-1; teams.forEach(t=>max=Math.max(max,agg[t.code][metric]));
    return { max, list: teams.filter(t=>agg[t.code][metric]===max).map(t=>({code:t.code,name:t.name,value:max})) };
  };
  const mostWins = metricMax('wins');
  const mostDraws = metricMax('draws');
  const mostLosses = metricMax('losses');
  let minInv=Infinity, maxInv=-1;
  teams.forEach(t=>{ const v=agg[t.code].gf+agg[t.code].ga; minInv=Math.min(minInv,v); maxInv=Math.max(maxInv,v); });
  const leastGoalsTeams = teams.filter(t=>agg[t.code].gf+agg[t.code].ga===minInv).map(t=>({code:t.code,name:t.name,value:minInv}));
  const mostGoalsTeams = teams.filter(t=>agg[t.code].gf+agg[t.code].ga===maxInv).map(t=>({code:t.code,name:t.name,value=maxInv}));
  return { highestScorelines, biggestWins, mostWins, mostDraws, mostLosses, leastGoalsTeams, mostGoalsTeams };
}

// Routes
app.get('/', (req,res)=>res.redirect('/ladder'));

app.get('/ladder', async (req,res)=>{
  const round=Math.min(Math.max(parseInt(req.query.round||'18',10),1),18);
  const teams=await getAllTeams();
  const fixtures=await getAllFixtures();
  const table=computeLadderForRound(round,teams,fixtures);
  res.render('ladder',{ round, table });
});

app.get('/draw', async (req,res)=>{
  const round = Math.min(Math.max(parseInt(req.query.round||'1',10),1),18);
  const teams = await getAllTeams();
  const rounds = [];
  for(let r=1;r<=18;r++){ rounds.push({ round:r, fixtures: await getFixturesForRound(r) }); }
  res.render('draw',{ teams, rounds, selectedRound: round });
});

app.get('/stats', async (req,res)=>{
  const { teams, positions } = await computePositionsByRound();
  const stats = await computeStats();
  res.render('stats',{ teams, positions, stats });
});

// Admin (Basic Auth)
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPass = process.env.ADMIN_PASS || 'changeme';
app.use('/admin', basicAuth({ users: { [adminUser]: adminPass }, challenge: true }));

app.get('/admin', async (req,res)=>{
  const round=Math.min(Math.max(parseInt(req.query.round||'1',10),1),18);
  const fixtures=await getFixturesForRound(round);
  res.render('admin',{ fixtures, round });
});

app.post('/admin/save', async (req,res)=>{
  const { round, ...body } = req.body;
  // Group updates by fixture id so we can set both columns together
  const perId = new Map();
  for (const [k,v] of Object.entries(body)){
    const m = k.match(/^score_(\d+)_(home|away)$/);
    if (!m) continue;
    const id = Number(m[1]);
    const side = m[2];
    const goals = v === '' ? null : Math.max(0, parseInt(v,10));
    if(!perId.has(id)) perId.set(id, { home:null, away:null });
    if(side==='home') perId.get(id).home = goals; else perId.get(id).away = goals;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [id, vals] of perId){
      await client.query('UPDATE fixtures SET home_goals = $1, away_goals = $2 WHERE id = $3', [vals.home, vals.away, id]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
  } finally {
    client.release();
  }
  res.redirect('/admin?round=' + (round||1));
});

// Style helper
app.locals.teamStyle = (c1,c2)=>`background: linear-gradient(90deg, ${c1||'#888'}, ${c2||'#444'}); color:#fff; border:1px solid rgba(0,0,0,.2);`;

init().then(()=>{
  app.listen(PORT, ()=> console.log('Server running on '+PORT));
}).catch(err => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});
