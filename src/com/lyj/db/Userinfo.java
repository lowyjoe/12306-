package com.lyj.db;

import java.util.Date;

/**
 * @author LIUYIJIAO
 * 类名称：Userinfo 
 * @date 2014-11-15 下午1:37:47 
 * 备注：
 */
public class Userinfo implements java.io.Serializable {

	// Fields

	private Integer id; //主键
	private String name;//名字
	private Integer age;//年龄
	private Date birthday;//生日
	private String address;//地址
	private String password;//密码

	// Constructors

	/** default constructor */
	public Userinfo() {
	}

	/** full constructor */
	

	// Property accessors
	public Integer getId() {
		return this.id;
	}

	public Userinfo(Integer id, String name, Integer age, Date birthday,
			String address, String password) {
		super();
		this.id = id;
		this.name = name;
		this.age = age;
		this.birthday = birthday;
		this.address = address;
		this.password = password;
	}

	public void setId(Integer id) {
		this.id = id;
	}

	public String getName() {
		return this.name;
	}

	public void setName(String name) {
		this.name = name;
	}

	public Integer getAge() {
		return this.age;
	}

	public void setAge(Integer age) {
		this.age = age;
	}

	public Date getBirthday() {
		return birthday;
	}

	public void setBirthday(Date birthday) {
		this.birthday = birthday;
	}

	public String getAddress() {
		return this.address;
	}



	public void setAddress(String address) {
		this.address = address;
	}

	public String getPassword() {
		return this.password;
	}

	public void setPassword(String password) {
		this.password = password;
	}

}