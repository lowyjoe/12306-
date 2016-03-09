package com.lyj.test;
/**
 * 
* @ClassName: JoinThread
* @Description:声明为volatile的简单变量如果当前值由该变量以前的值相关
* 那么volatile关键字不起作用，也就是说如下的表达式都不是原子操作： 
	n  =  n  +   1 ; 
	n ++ ; 
* @author liuyijiao
* @date 2016-3-9 上午10:47:00
* @version V1.0
 */
/*public   class  JoinThread  extends  Thread
{
     public   static volatile int  n  =   0 ;
    public   void  run()
    {
         for  ( int  i  =   0 ; i  <   10 ; i ++ )
             try 
        {
                n  =  n  +   1 ;
                sleep( 3 );  //  为了使运行结果更随机，延迟3毫秒 

            }
             catch  (Exception e)
            {
            }
    }

     public   static   void  main(String[] args)  throws  Exception
    {

        Thread threads[]  =   new  Thread[ 100 ];
         for  ( int  i  =   0 ; i  <  threads.length; i ++ )
             //  建立100个线程 
            threads[i]  =   new  JoinThread();
         for  ( int  i  =   0 ; i  <  threads.length; i ++ )
             //  运行刚才建立的100个线程 
            threads[i].start();
         for  ( int  i  =   0 ; i  <  threads.length; i ++ )
             //  100个线程都执行完后继续 
            threads[i].join();
        System.out.println( " n= "   +  JoinThread.n);
    }
} */
//如果要想使这种情况变成原子操作，需要使用synchronized关键字，如上的代码可以改成如下的形式： 

public   class  JoinThread  extends  Thread
{
     public   static int  n  =   0 ;

     public static   synchronized   void  inc()
    {
        n ++ ;
    }
     public   void  run()
    {
         for  ( int  i  =   0 ; i  <   10 ; i ++ )
             try 
            {
                inc();  //  n = n + 1 改成了 inc(); 
                System.out.println(n);
                sleep( 3 );  //  为了使运行结果更随机，延迟3毫秒 

            }
             catch  (Exception e)
            {
            }
    }

     public   static   void  main(String[] args)  throws  Exception
    {

        Thread threads[]  =   new  Thread[ 100 ];
         for  ( int  i  =   0 ; i  <  threads.length; i ++ )
             //  建立100个线程 
            threads[i]  =   new  JoinThread();
         for  ( int  i  =   0 ; i  <  threads.length; i ++ )
             //  运行刚才建立的100个线程 
            threads[i].start();
        for  ( int  i  =   0 ; i  <  threads.length; i ++ )
             //  100个线程都执行完后继续 
            threads[i].join(); 
        System.out.println( " n= "   +  JoinThread.n);
    }
} 
