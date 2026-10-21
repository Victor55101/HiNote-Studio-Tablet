package com.hinote.studio;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public class SoftKeyboardOverrideTest {
    static final class Backend implements SoftKeyboardOverride.Backend {
        int mode;boolean accepts=true,virtualEnabled;final List<Integer> requests=new ArrayList<>();
        public int getMode(){return mode;}
        public boolean setMode(int value){requests.add(value);if(!accepts)return false;mode=value;return true;}
        public boolean showsWithHardware(){return virtualEnabled;}
    }
    @Test public void explicitOpeningIsIdempotentAndReleaseRestoresAutomaticPolicy(){
        Backend b=new Backend();SoftKeyboardOverride control=new SoftKeyboardOverride(b);
        assertTrue(control.allowKeys());assertTrue(control.allowKeys());assertTrue(control.ownsMode());
        assertEquals(List.of(2),b.requests);
        assertTrue(control.release());assertTrue(control.release());assertFalse(control.ownsMode());
        assertEquals(List.of(2,0),b.requests);
        assertTrue(control.allowKeys());assertEquals(List.of(2,0,2),b.requests);
    }
    @Test public void cannotTakeOverAnotherAccessibilityPolicy(){
        for(int mode:new int[]{1,2}){
            Backend b=new Backend();b.mode=mode;SoftKeyboardOverride control=new SoftKeyboardOverride(b);
            assertTrue(control.anotherPolicy());assertFalse(control.allowKeys());assertTrue(control.release());
            assertTrue(b.requests.isEmpty());assertEquals(mode,b.mode);
        }
    }
    @Test public void refusedOpeningDoesNotBecomeAnOwnershipClaimOrRetryLoop(){
        Backend b=new Backend();b.accepts=false;SoftKeyboardOverride control=new SoftKeyboardOverride(b);
        assertFalse(control.allowKeys());b.accepts=true;assertFalse(control.allowKeys());
        assertTrue(control.wasRefused());assertFalse(control.ownsMode());assertTrue(control.release());
        assertEquals(List.of(2),b.requests);assertEquals(0,b.mode);
    }
    @Test public void userRevocationCannotBeUndoneByDelayedOpening(){
        Backend b=new Backend();SoftKeyboardOverride control=new SoftKeyboardOverride(b);
        assertTrue(control.allowKeys());b.mode=0;control.changed(0);
        assertFalse(control.allowKeys());assertTrue(control.release());assertTrue(control.wasRefused());
        assertEquals(List.of(2),b.requests);
    }
    @Test public void detectsRevocationEvenBeforeItsNotificationArrives(){
        Backend b=new Backend();SoftKeyboardOverride control=new SoftKeyboardOverride(b);
        assertTrue(control.allowKeys());b.mode=0;
        assertFalse(control.allowKeys());assertEquals(List.of(2),b.requests);
    }
    @Test public void backgroundCleanupPreservesANewerForeignPolicy(){
        Backend b=new Backend();SoftKeyboardOverride control=new SoftKeyboardOverride(b);
        assertTrue(control.allowKeys());b.mode=1;assertTrue(control.release());
        assertEquals(1,b.mode);assertEquals(List.of(2),b.requests);assertFalse(control.allowKeys());
    }
    @Test public void failedReleaseKeepsOwnershipSoServiceCanRequestSystemCleanup(){
        Backend b=new Backend();SoftKeyboardOverride control=new SoftKeyboardOverride(b);
        assertTrue(control.allowKeys());b.accepts=false;assertFalse(control.release());assertTrue(control.ownsMode());
        b.accepts=true;assertTrue(control.release());assertFalse(control.ownsMode());assertEquals(0,b.mode);
    }
    @Test public void enabledSystemPreferenceUsesHiddenPolicyAndRestoresItOnTouchOrExit(){
        Backend b=new Backend();b.virtualEnabled=true;SoftKeyboardOverride control=new SoftKeyboardOverride(b);
        assertTrue(control.allowKeys());assertTrue(b.requests.isEmpty());
        assertTrue(control.physicalKeys());assertTrue(control.physicalKeys());assertTrue(control.hidesKeys());
        assertEquals(List.of(1),b.requests);assertTrue(b.virtualEnabled);
        assertTrue(control.allowKeys());assertFalse(control.ownsMode());assertEquals(List.of(1,0),b.requests);
        assertTrue(control.physicalKeys());assertTrue(control.release());assertTrue(b.virtualEnabled);
        assertEquals(List.of(1,0,1,0),b.requests);
    }
    @Test public void disabledPreferenceReleasesOnlyOurOpeningWithoutAcquiringHiddenPolicy(){
        Backend b=new Backend();SoftKeyboardOverride control=new SoftKeyboardOverride(b);
        assertTrue(control.physicalKeys());assertTrue(b.requests.isEmpty());
        assertTrue(control.allowKeys());assertTrue(control.physicalKeys());
        assertEquals(List.of(2,0),b.requests);assertFalse(control.hidesKeys());assertFalse(b.virtualEnabled);
    }
    @Test public void physicalPolicyCannotOverwriteForeignOwnershipOrARevocation(){
        for(int mode:new int[]{1,2}){
            Backend b=new Backend();b.virtualEnabled=true;b.mode=mode;SoftKeyboardOverride control=new SoftKeyboardOverride(b);
            assertFalse(control.physicalKeys());assertTrue(control.release());assertTrue(b.requests.isEmpty());
        }
        Backend b=new Backend();b.virtualEnabled=true;SoftKeyboardOverride control=new SoftKeyboardOverride(b);
        assertTrue(control.physicalKeys());b.mode=2;control.changed(2);
        assertFalse(control.physicalKeys());assertFalse(control.allowKeys());assertTrue(control.release());
        assertEquals(List.of(1),b.requests);
    }
}
