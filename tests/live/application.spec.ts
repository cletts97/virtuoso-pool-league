import { test,expect,type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
const url=process.env.SUPABASE_URL!;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Run with scripts/test-live-ui.mjs against local Supabase.');
const admin=createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}),pool=new Pool({connectionString:process.env.DATABASE_URL});
const accounts:{id:string;name:string;email:string;password:string}[]=[];
const prefix=`Browser ${Date.now()}`;
test.beforeAll(async()=>{
  for(let i=0;i<4;i++){
    const email=`vpl-browser-${Date.now()}-${i}@virtuoso.tech`,password=`Local-only-${crypto.randomUUID()}`,name=`${prefix} ${i}`;
    const invite=await admin.auth.admin.generateLink({type:'invite',email,options:{data:{name}}});if(invite.error)throw invite.error;
    const client=createClient(url,process.env.SUPABASE_PUBLIC_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    const accepted=await client.auth.verifyOtp({token_hash:invite.data.properties.hashed_token,type:'invite'});if(accepted.error)throw accepted.error;
    const set=await client.auth.updateUser({password});if(set.error)throw set.error;
    accounts.push({id:invite.data.user.id,email,password,name});
  }
  await pool.query("UPDATE public.profiles SET role='admin',department='Test' WHERE auth_user_id=$1",[accounts[0].id]);
});
test.afterAll(async()=>{
  await pool.query("UPDATE public.table_bookings SET status='cancelled' WHERE owner_id=ANY($1::uuid[])",[accounts.map((a)=>a.id)]);
  for(const a of accounts)await admin.auth.admin.deleteUser(a.id);
  await pool.end();
});
async function login(page:Page,index:number){await page.goto('/login');await page.getByLabel('Work email').fill(accounts[index].email);await page.getByLabel('Password',{exact:true}).fill(accounts[index].password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:/Good to see you/})).toBeVisible();}
test('real colleague login, shared casual booking, TV polling and logout',async({page,context})=>{
  await page.goto('/bookings');await expect(page.getByRole('heading',{name:'Welcome to the league.'})).toBeVisible();
  await login(page,1);await expect(page.getByLabel('Playing as')).toHaveCount(0);await expect(page.getByRole('button',{name:'Reset demo data'})).toHaveCount(0);
  await page.goto('/bookings');
  // Find the first open day from the actual London-time calendar.
  for(let i=0;i<8;i++){await page.locator('.booking-days button').nth(i).click();if(await page.locator('.availability-slots button').count())break;}
  await page.locator('.availability-slots button').first().click();await page.getByRole('button',{name:'Confirm reservation'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.booking-card').filter({hasText:accounts[1].name})).toBeVisible();
  const other=await context.newPage();await other.goto('/bookings');
  const date=await page.locator('.booking-days button[aria-pressed="true"]').textContent();
  await other.locator('.booking-days button').filter({hasText:date!.trim()}).click();
  await expect(other.locator('.booking-card').filter({hasText:accounts[1].name})).toBeVisible();
  await other.goto('/display');await expect(other.locator('.tv-qr svg')).toBeVisible();await expect(other.locator('button,select')).toHaveCount(0);await expect(other.locator('body')).not.toContainText(accounts[1].email);
  await other.close();await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
});
test('admin enrolls invited colleagues, publishes a season, and two sessions submit and approve',async({page,browser})=>{
  await login(page,0);await page.goto('/admin');await page.getByRole('tab',{name:'Players',exact:true}).click();
  for(const account of accounts){const row=page.locator('.managed-player').filter({hasText:account.name}).filter({has:page.getByRole('button',{name:'Add to league',exact:true})});await row.getByRole('button',{name:'Add to league'}).click();}
  await page.getByRole('button',{name:'Create season',exact:true}).click();await page.getByLabel('Season name').fill(prefix);await page.getByRole('button',{name:'Create draft season'}).click();
  await page.getByRole('tab',{name:'Season & configuration'}).click();await page.getByRole('button',{name:'Generate fixtures',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Generate fixtures',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const fixtures=(await pool.query(`SELECT f.id,p1.auth_user_id AS home,p2.auth_user_id AS away FROM public.fixtures f JOIN public.seasons s ON s.id=f.season_id JOIN public.participant_members m1 ON m1.participant_id=f.home_id JOIN public.participant_members m2 ON m2.participant_id=f.away_id JOIN public.profiles p1 ON p1.id=m1.profile_id JOIN public.profiles p2 ON p2.id=m2.profile_id WHERE s.name=$1 ORDER BY f.round`,[prefix])).rows;
  expect(fixtures).toHaveLength(6);const fixture=fixtures[0],home=accounts.findIndex((a)=>a.id===fixture.home),away=accounts.findIndex((a)=>a.id===fixture.away);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await login(page,home);await page.goto(`/fixtures/${fixture.id}`);await page.getByRole('button',{name:'Submit result',exact:true}).click();await page.getByRole('radio').first().check();await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const opponentContext=await browser.newContext();const opponent=await opponentContext.newPage();await login(opponent,away);await opponent.goto(`/fixtures/${fixture.id}`);await opponent.getByRole('button',{name:'Approve result',exact:true}).click();await opponent.getByRole('button',{name:'Confirm result',exact:true}).click();await expect(opponent.locator('.page-heading .badge')).toHaveText('Confirmed');await page.reload();await expect(page.locator('.page-heading .badge')).toHaveText('Confirmed');await opponentContext.close();
});
test('invitation callback sets a password and grants casual access',async({page})=>{
  const email=`vpl-browser-invite-${Date.now()}@virtuoso.tech`,password=`Local-only-${crypto.randomUUID()}`;
  const invitation=await admin.auth.admin.generateLink({type:'invite',email,options:{data:{name:'Browser Invite'}}});if(invitation.error)throw invitation.error;
  accounts.push({id:invitation.data.user.id,name:'Browser Invite',email,password});
  await page.goto(`/auth/callback?token_hash=${invitation.data.properties.hashed_token}&type=invite`);await page.getByRole('button',{name:'Continue securely'}).click();await page.getByLabel('New password',{exact:true}).fill(password);await page.getByLabel('Confirm password',{exact:true}).fill(password);await page.getByRole('button',{name:'Save password and sign in'}).click();await expect(page.getByRole('heading',{name:'Welcome to the league.'})).toBeVisible();
  await login(page,accounts.length-1);await page.goto('/bookings');await expect(page.getByRole('button',{name:'Reserve the table',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Administration'})).toHaveCount(0);
  await page.screenshot({path:'.tools/screenshots/live-bookings.png',fullPage:true});
});
