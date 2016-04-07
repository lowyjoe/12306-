package com.lyj.test;

import java.text.SimpleDateFormat;
import java.util.Date;

public class Getmem {
    static int limit = 1024*512;
    public Getmem() {
    }
    
    public static void main(String args[]) {
        getCurMem();
        waitFor5s();
        
        String tmpArray[] = new String[limit];//1m
        getCurMem();
        waitFor5s();
        
        for (int i = 0; i < limit; i++) {
            tmpArray[i] = new String("abcde");
        }
        getCurMem();
        waitFor5s();
    }
    
    static float bitTomega(long bit) {
        return (float)bit/1024/1024;
    }
    
    static void getCurMem() {
        SimpleDateFormat tmpDate = new SimpleDateFormat("yyyy-MM-dd" + " " + "hh:mm:ss");
        System.out.println(tmpDate.format(new Date()));
        System.out.println("   current memory: " + bitTomega(Runtime.getRuntime().totalMemory()) + "M");
        System.out.println("   max memory: " + bitTomega(Runtime.getRuntime().maxMemory()) + "M");
        System.out.println("   free memory: " + bitTomega(Runtime.getRuntime().freeMemory()) + "M");
    }
    
    static void waitFor5s() {
        try {
            Thread.sleep(5000);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}