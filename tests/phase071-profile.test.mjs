import test from "node:test";
import assert from "node:assert/strict";
import {profileCompletion,emptyProfileDetails,PROFILE_FIELDS} from "../src/lib/profile-completion.ts";
const full={full_name:"Example User",phone:"+94771234567",district:"Colombo",city:"Colombo",about:"Selling useful items honestly.",contact_preference:"chat",photo_path:"uid/avatar.webp",email_notifications:true};
test("Empty profiles have zero completion; do not grant verification",()=>{
 const value=profileCompletion("",emptyProfileDetails);
 assert.equal(value.percentage,0);assert.equal(value.complete,false);assert.equal(value.missing.length,8);
});
test("Profile completion reaches 100% only with eight requirements",()=>{
 const value=profileCompletion("Example",full);
 assert.equal(value.percentage,100);assert.equal(value.complete,true);assert.equal(value.done,8);
});
test("Unverified/invalid phone does not count as a completed phone field",()=>{
 const value=profileCompletion("Example",{...full,phone:"0771234567"});
 assert.equal(value.complete,false);assert.deepEqual(value.missing,["Phone"]);assert.equal(value.percentage,88);
});
test("Photo and bio missing both lower completion",()=>{
 const value=profileCompletion("Example",{...full,photo_path:null,about:"Hi"});
 assert.equal(value.done,6);assert.equal(value.percentage,75);
});
test("Completion fields are stable, no sensitive NIC/address requirement",()=>{
 assert.equal(PROFILE_FIELDS.length,8);assert.equal(PROFILE_FIELDS.includes("Profile photo"),true);
});
