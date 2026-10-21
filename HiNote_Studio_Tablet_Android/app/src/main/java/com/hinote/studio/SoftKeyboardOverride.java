package com.hinote.studio;

/** Own only our temporary accessibility override; never replace another service's policy. */
final class SoftKeyboardOverride {
    static final int AUTO=0, HIDE_KEYS=1, ALLOW_WITH_HARD_KEYBOARD=2;
    interface Backend {
        int getMode(); boolean setMode(int mode);
        default boolean showsWithHardware(){return false;}
    }
    private final Backend backend;
    private volatile int ownedMode=AUTO;
    private volatile boolean refused,originalEnabled;
    SoftKeyboardOverride(Backend backend){this.backend=backend;}
    boolean allowKeys(){
        if(!mayControl())return false;
        // With the user's preference already on, AUTO is sufficient. Avoid
        // acquiring an override which would cause an unnecessary IME reset.
        if(virtualKeysEnabled())return release();
        return acquire(ALLOW_WITH_HARD_KEYBOARD);
    }
    boolean physicalKeys(){
        if(!mayControl())return false;
        // HIDDEN suppresses requests for the input view without disconnecting
        // the IME. Its own candidates window can still be shown by the IME.
        if(virtualKeysEnabled())return acquire(HIDE_KEYS);
        return release();
    }
    boolean virtualKeysEnabled(){
        return ownedMode==ALLOW_WITH_HARD_KEYBOARD?originalEnabled:backend.showsWithHardware();
    }
    private boolean mayControl(){
        int current=backend.getMode();
        if(ownedMode!=AUTO&&current!=ownedMode){ownedMode=AUTO;refused=true;}
        return !refused&&(ownedMode!=AUTO||current==AUTO);
    }
    private boolean acquire(int mode){
        int current=backend.getMode();
        if(ownedMode!=AUTO&&current!=ownedMode){ownedMode=AUTO;refused=true;}
        if(ownedMode==mode)return true;
        if(refused||(ownedMode==AUTO&&current!=AUTO))return false;
        if(ownedMode==AUTO)originalEnabled=backend.showsWithHardware();
        if(!backend.setMode(mode)){refused=true;return false;}
        ownedMode=mode;return true;
    }
    boolean release(){
        if(ownedMode==AUTO)return true;
        if(backend.getMode()!=ownedMode){ownedMode=AUTO;refused=true;return true;}
        if(!backend.setMode(AUTO))return false;
        ownedMode=AUTO;return true;
    }
    void changed(int mode){
        if(ownedMode!=AUTO&&mode!=ownedMode){ownedMode=AUTO;refused=true;}
    }
    boolean ownsMode(){return ownedMode!=AUTO;}
    boolean hidesKeys(){return ownedMode==HIDE_KEYS;}
    boolean wasRefused(){return refused;}
    boolean anotherPolicy(){return ownedMode==AUTO&&backend.getMode()!=AUTO;}
}
