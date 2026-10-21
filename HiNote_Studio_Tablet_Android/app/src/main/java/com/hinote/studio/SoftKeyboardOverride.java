package com.hinote.studio;

/** Own only our temporary accessibility override; never replace another service's policy. */
final class SoftKeyboardOverride {
    static final int AUTO=0, ALLOW_WITH_HARD_KEYBOARD=2;
    interface Backend { int getMode(); boolean setMode(int mode); }
    private final Backend backend;
    private volatile boolean owned,refused;
    SoftKeyboardOverride(Backend backend){this.backend=backend;}
    boolean allowKeys(){
        int current=backend.getMode();
        if(owned&&current!=ALLOW_WITH_HARD_KEYBOARD){owned=false;refused=true;}
        if(owned)return true;
        if(refused||current!=AUTO)return false;
        if(!backend.setMode(ALLOW_WITH_HARD_KEYBOARD)){refused=true;return false;}
        owned=true;return true;
    }
    boolean release(){
        if(!owned)return true;
        if(backend.getMode()!=ALLOW_WITH_HARD_KEYBOARD){owned=false;refused=true;return true;}
        if(!backend.setMode(AUTO))return false;
        owned=false;return true;
    }
    void changed(int mode){
        if(owned&&mode!=ALLOW_WITH_HARD_KEYBOARD){owned=false;refused=true;}
    }
    boolean ownsMode(){return owned;}
    boolean wasRefused(){return refused;}
    boolean anotherPolicy(){return !owned&&backend.getMode()!=AUTO;}
}
