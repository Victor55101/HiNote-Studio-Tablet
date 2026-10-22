package com.hinote.studio;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public class KeyboardPreferenceLeaseTest {
    static final class Backend implements KeyboardPreferenceLease.Backend {
        boolean enabled=true,authorized=true,pending,accepts=true;int policy;
        String value="1",original;final List<String> calls=new ArrayList<>();
        public boolean enabled(){return enabled;}public boolean authorized(){return authorized;}
        public int policy(){return policy;}public String read(){return value;}
        public boolean write(String next){calls.add("write:"+next);if(!accepts)return false;value=next;return true;}
        public boolean pending(){return pending;}public String original(){return original;}
        public boolean save(String previous){calls.add("save:"+previous);pending=true;original=previous;return true;}
        public void clear(){pending=false;original=null;calls.add("clear");}
    }
    @Test public void noMutationWithoutBothConsentAndSystemGrant(){
        Backend b=new Backend();b.enabled=false;assertFalse(new KeyboardPreferenceLease(b).start());assertTrue(b.calls.isEmpty());
        b.enabled=true;b.authorized=false;assertFalse(new KeyboardPreferenceLease(b).start());assertTrue(b.calls.isEmpty());assertEquals("1",b.value);
    }
    @Test public void foregroundLeaseRestoresTheExactOriginalOnValue(){
        Backend b=new Backend();KeyboardPreferenceLease lease=new KeyboardPreferenceLease(b);
        assertTrue(lease.start());assertEquals(List.of("save:1","write:0"),b.calls);assertEquals("0",b.value);
        assertTrue(lease.start());assertEquals(2,b.calls.size());assertTrue(lease.stop());assertEquals("1",b.value);assertFalse(b.pending);
        assertTrue(lease.stop());assertEquals(List.of("save:1","write:0","write:1","clear"),b.calls);
    }
    @Test public void originalOffOrAbsentRequiresNoSettingWrite(){
        for(String value:new String[]{null,"0"}){Backend b=new Backend();b.value=value;KeyboardPreferenceLease l=new KeyboardPreferenceLease(b);assertTrue(l.start());assertTrue(l.stop());assertEquals(value,b.value);assertTrue(b.calls.isEmpty());}
    }
    @Test public void anInterruptedSessionIsRecoveredBeforeAnOptedOutRestart(){
        Backend b=new Backend();assertTrue(new KeyboardPreferenceLease(b).start());b.enabled=false;
        assertFalse(new KeyboardPreferenceLease(b).start());assertEquals("1",b.value);assertFalse(b.pending);
    }
    @Test public void failedWriteDoesNotLeaveARestoreJournalForAnUnchangedSetting(){
        Backend b=new Backend();b.accepts=false;assertFalse(new KeyboardPreferenceLease(b).start());assertEquals("1",b.value);assertFalse(b.pending);
    }
    @Test public void revokedPermissionRetainsRecoveryUntilItIsGrantedAgain(){
        Backend b=new Backend();KeyboardPreferenceLease l=new KeyboardPreferenceLease(b);assertTrue(l.start());b.authorized=false;assertFalse(l.stop());assertTrue(b.pending);
        b.authorized=true;b.enabled=false;assertFalse(new KeyboardPreferenceLease(b).start());assertEquals("1",b.value);assertFalse(b.pending);
    }
    @Test public void anotherKeyboardPolicyIsNeitherReplacedNorRestoredOver(){
        Backend b=new Backend();b.policy=2;KeyboardPreferenceLease l=new KeyboardPreferenceLease(b);assertFalse(l.start());assertTrue(b.calls.isEmpty());
        b.policy=0;assertTrue(l.start());b.policy=2;assertFalse(l.stop());assertEquals("0",b.value);assertTrue(b.pending);
        b.policy=0;assertTrue(l.stop());assertEquals("1",b.value);
    }
    @Test public void aLaterValueOrExplicitUserOverrideIsRespected(){
        Backend b=new Backend();KeyboardPreferenceLease l=new KeyboardPreferenceLease(b);assertTrue(l.start());b.value="3";assertTrue(l.stop());assertEquals("3",b.value);
        b.value="1";assertTrue(l.start());l.abandon();assertEquals("0",b.value);assertFalse(b.pending);
    }
}
